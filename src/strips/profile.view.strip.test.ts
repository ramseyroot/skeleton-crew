import assert from "node:assert/strict";
import { test } from "node:test";
import { runStrip } from "../lib/strip.ts";
import { makeError } from "../lib/result.ts";
import { CACHE_KINDS, DATABASE_KINDS, makeTestPorts } from "../test-utils/ports.ts";
import { saveProfile } from "./profile.save.strip.ts";
import { viewProfile } from "./profile.view.strip.ts";

for (const database of DATABASE_KINDS) {
  for (const cache of CACHE_KINDS) {
    const label = `profile.view [db ${database}, cache ${cache}]`;

    test(`${label}: returns the profile from the database`, async (t) => {
      const { ports, cleanup } = await makeTestPorts({ database, cache });
      t.after(cleanup);
      const r = await runStrip(viewProfile, ports, { userId: "u1" });
      assert.deepEqual(r, { ok: true, value: { userId: "u1", displayName: "Ada" }, stripId: "strip-1" });
    });

    test(`${label}: a save is visible on the next view, so a stale cache never shows old data`, async (t) => {
      const { ports, cleanup } = await makeTestPorts({ database, cache });
      t.after(cleanup);
      await runStrip(viewProfile, ports, { userId: "u1" });
      const saved = await runStrip(saveProfile, ports, { userId: "u1", displayName: "Ada L." });
      assert.equal(saved.ok, true);
      const after = await runStrip(viewProfile, ports, { userId: "u1" });
      assert.deepEqual(after.ok && after.value, { userId: "u1", displayName: "Ada L." });
    });

    test(`${label}: an unknown user aborts with a generic message`, async (t) => {
      const { ports, cleanup } = await makeTestPorts({ database, cache });
      t.after(cleanup);
      const r = await runStrip(viewProfile, ports, { userId: "ghost" });
      assert.equal(r.ok, false);
      if (!r.ok) {
        assert.equal(r.error.kind, "not_found");
        assert.deepEqual(r.display, { type: "generic", reference: r.stripId });
      }
    });

    test(`${label}: a cache that fails on read and write does not fail the view`, async (t) => {
      const { ports, cleanup } = await makeTestPorts({ database, cache });
      t.after(cleanup);
      const down = async () => ({ ok: false as const, error: makeError("network", "adapter:test", "", "cache down") });
      const broken = { ...ports, cache: { ...ports.cache, get: down, set: down } };
      const r = await runStrip(viewProfile, broken, { userId: "u1" });
      assert.deepEqual(r.ok && r.value, { userId: "u1", displayName: "Ada" });
    });
  }
}

function countingDatabase(ports: Awaited<ReturnType<typeof makeTestPorts>>["ports"]) {
  const counter = { reads: 0 };
  const database = { ...ports.database, read: (c: string) => { counter.reads += 1; return ports.database.read(c); } };
  return { counter, ports: { ...ports, database } };
}

test("profile.view (cache memory): the second view is served from the cache", async (t) => {
  const made = await makeTestPorts({ cache: "memory" });
  t.after(made.cleanup);
  const { counter, ports } = countingDatabase(made.ports);
  await runStrip(viewProfile, ports, { userId: "u1" });
  assert.equal(counter.reads, 1);
  const second = await runStrip(viewProfile, ports, { userId: "u1" });
  assert.deepEqual(second.ok && second.value, { userId: "u1", displayName: "Ada" });
  assert.equal(counter.reads, 1, "no database read on a cache hit");
});

test("profile.view (cache null): every view reads the database", async (t) => {
  const made = await makeTestPorts({ cache: "null" });
  t.after(made.cleanup);
  const { counter, ports } = countingDatabase(made.ports);
  await runStrip(viewProfile, ports, { userId: "u1" });
  await runStrip(viewProfile, ports, { userId: "u1" });
  assert.equal(counter.reads, 2);
});

test("profile.view (cache memory): an expired entry is read again", async (t) => {
  const made = await makeTestPorts({ cache: "memory" });
  t.after(made.cleanup);
  const { counter, ports } = countingDatabase(made.ports);
  await runStrip(viewProfile, ports, { userId: "u1" });
  made.clock.advance(60_000);
  await runStrip(viewProfile, ports, { userId: "u1" });
  assert.equal(counter.reads, 2);
});

test("profile.view: it only reads users and only writes the profile cache", () => {
  assert.deepEqual(viewProfile.budget, { reads: ["users", "cache:profile"], writes: ["cache:profile"], storage: [] });
  assert.deepEqual(viewProfile.invalidates, []);
});
