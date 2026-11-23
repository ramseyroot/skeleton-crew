import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { runStrip } from "../../../lib/strip.ts";
import { makeError } from "../../../lib/result.ts";
import { CACHE_KINDS, DATABASE_KINDS, makeTestPorts } from "../testing.ts";
import type { CacheKind, DatabaseKind } from "../testing.ts";
import { saveProfile } from "./profile.save.strip.ts";

const Cached = z.object({ userId: z.string(), displayName: z.string() });

function matrix(name: string, body: (database: DatabaseKind, cache: CacheKind) => Promise<void>) {
  for (const database of DATABASE_KINDS) {
    for (const cache of CACHE_KINDS) {
      test(`profile.save [db ${database}, cache ${cache}]: ${name}`, () => body(database, cache));
    }
  }
}

const setup = (database: DatabaseKind, cache: CacheKind) => makeTestPorts({ database, cache });

matrix("saves the name and trims it", async (database, cache) => {
  const { ports, cleanup } = await setup(database, cache);
  try {
    const r = await runStrip(saveProfile, ports, { userId: "u1", displayName: "  Ada Lovelace " });
    assert.deepEqual(r, { ok: true, value: { userId: "u1", displayName: "Ada Lovelace" }, stripId: "strip-1" });
    const stored = await ports.database.read("users").get("u1");
    assert.equal(stored.ok && stored.value?.displayName, "Ada Lovelace");
  } finally {
    cleanup();
  }
});

matrix("a successful save removes the cached profile and leaves other profiles alone", async (database, cache) => {
  const { ports, cleanup } = await setup(database, cache);
  try {
    await ports.cache.set("profile:u1", { userId: "u1", displayName: "Ada" }, { ttlMs: 60_000 });
    await ports.cache.set("profile:u2", { userId: "u2", displayName: "Grace" }, { ttlMs: 60_000 });
    const r = await runStrip(saveProfile, ports, { userId: "u1", displayName: "Ada L." });
    assert.equal(r.ok, true);
    const first = await ports.cache.get("profile:u1", Cached);
    const second = await ports.cache.get("profile:u2", Cached);
    assert.equal(first.ok && first.value.hit, false);
    // With the null cache nothing is ever stored, so the second profile is a miss too.
    assert.equal(second.ok && second.value.hit, cache === "memory");
  } finally {
    cleanup();
  }
});

matrix("an empty name is shown to the user as a toast and nothing changes", async (database, cache) => {
  const { ports, cleanup } = await setup(database, cache);
  try {
    await ports.cache.set("profile:u1", { userId: "u1", displayName: "Ada" }, { ttlMs: 60_000 });
    const r = await runStrip(saveProfile, ports, { userId: "u1", displayName: "   " });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error.kind, "validation");
      assert.deepEqual(r.display, { type: "toast", message: "Please enter a name between 1 and 60 characters." });
    }
    const stored = await ports.database.read("users").get("u1");
    assert.equal(stored.ok && stored.value?.displayName, "Ada");
    const cached = await ports.cache.get("profile:u1", Cached);
    assert.equal(cached.ok && cached.value.hit, cache === "memory", "a failed strip invalidates nothing");
  } finally {
    cleanup();
  }
});

matrix("a name that is taken, in any letter case, is a toast", async (database, cache) => {
  const { ports, cleanup } = await setup(database, cache);
  try {
    const r = await runStrip(saveProfile, ports, { userId: "u1", displayName: "gRaCe" });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error.kind, "conflict");
      assert.deepEqual(r.display, { type: "toast", message: "That name is taken. Please choose another." });
    }
  } finally {
    cleanup();
  }
});

matrix("an unknown user aborts with a generic message and a reference code", async (database, cache) => {
  const { ports, cleanup } = await setup(database, cache);
  try {
    const r = await runStrip(saveProfile, ports, { userId: "ghost", displayName: "Nobody" });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error.kind, "not_found");
      assert.equal(r.error.audience, "internal");
      assert.deepEqual(r.display, { type: "generic", reference: r.stripId });
    }
  } finally {
    cleanup();
  }
});

matrix("an unexpected failure gives a generic message and never leaks its text", async (database, cache) => {
  const { ports, cleanup } = await setup(database, cache);
  try {
    const broken = { ...ports, database: { ...ports.database, write: (): never => { throw new Error("connection string: postgres://secret"); } } };
    const r = await runStrip(saveProfile, broken, { userId: "u1", displayName: "Ada L." });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error.kind, "unexpected");
      assert.equal(r.display.type, "generic");
      assert.equal(JSON.stringify(r.display).includes("secret"), false);
    }
  } finally {
    cleanup();
  }
});

matrix("a network failure is retried twice", async (database, cache) => {
  const { ports, cleanup } = await setup(database, cache);
  try {
    let calls = 0;
    const real = ports.database.write("users");
    const flaky = {
      ...ports,
      database: {
        ...ports.database,
        write: () => ({
          ...real,
          update: async (id: string, patch: Record<string, string | number | boolean | null>) => {
            calls += 1;
            if (calls <= 2) return { ok: false as const, error: makeError("network", "adapter:test", "", "timeout", { retryable: true }) };
            return real.update(id, patch);
          },
        }),
      },
    };
    const r = await runStrip(saveProfile, flaky, { userId: "u1", displayName: "Ada L." });
    assert.equal(r.ok, true);
    assert.equal(calls, 3);
  } finally {
    cleanup();
  }
});

test("profile.save: its budget lets it write users and nothing else", () => {
  assert.deepEqual(saveProfile.budget, { reads: ["users"], writes: ["users"], storage: [] });
  assert.deepEqual(saveProfile.invalidates, ["profile:{userId}"]);
});
