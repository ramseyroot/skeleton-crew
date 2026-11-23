import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import type { Cache } from "../../../ports/cache.ts";
import { portError } from "../../../lib/port-error.ts";
import { err } from "../../../lib/result.ts";
import { createFixedClock } from "../../clock/fixed/index.ts";
import { createMemoryLogger } from "../../logger/memory/index.ts";
import { runCacheContract } from "../contract.test.ts";
import type { CacheOverrides } from "../contract.test.ts";
import { errorMap } from "./errors.ts";
import { createMemoryCache } from "./index.ts";

const V = z.object({ n: z.number() });

function build(overrides: CacheOverrides = {}, store?: Map<string, string>, app = "app", env = "local") {
  const clock = createFixedClock();
  const logger = createMemoryLogger({ env, clock });
  const cache = createMemoryCache({
    app,
    env,
    schemaVersion: overrides.schemaVersion ?? 1,
    clock,
    logger,
    ...(store ? { store } : {}),
  });
  return { cache, clock, logger, plantRaw: cache.plantRaw };
}

runCacheContract("cache/memory", (o) => build(o), { stores: true });

// A cache without prefix delete: the contract must skip the prefix-count case for it.
runCacheContract(
  "cache/fake-no-prefix",
  (o) => {
    // Wraps the memory cache but declares no prefix support, like a KV store without list-and-delete.
    const h = build(o);
    const fake: Cache = {
      name: h.cache.name,
      capabilities: { prefixDelete: false },
      get: (k, s) => h.cache.get(k, s),
      set: (k, v, opts) => h.cache.set(k, v, opts),
      delete: (k) => h.cache.delete(k),
      async deleteByPrefix() {
        return err(portError("validation", "cache/fake", "prefix delete not supported"));
      },
    };
    return { ...h, cache: fake };
  },
  { stores: true },
);

test("cache/memory: caches with different app, env or schemaVersion do not see each other's entries", async () => {
  const store = new Map<string, string>();
  const base = build({}, store);
  const others = [build({}, store, "other-app"), build({}, store, "app", "prod"), build({ schemaVersion: 2 }, store)];
  await base.cache.set("k", { n: 1 }, { ttlMs: 1000 });
  for (const o of others) {
    assert.deepEqual(await o.cache.get("k", V), { ok: true, value: { hit: false, reason: "absent" } });
    assert.deepEqual(o.cache.rawKeys(), []);
  }
  assert.deepEqual(base.cache.rawKeys(), ["k"]);
  // Writing in another namespace and deleting by prefix there leaves the base entry alone.
  await others[0]?.cache.set("k", { n: 2 }, { ttlMs: 1000 });
  assert.deepEqual(await others[0]?.cache.deleteByPrefix(""), { ok: true, value: { deleted: 1 } });
  assert.deepEqual(await base.cache.get("k", V), { ok: true, value: { hit: true, value: { n: 1 } } });
  assert.equal(store.size, 1);
});

test("cache/memory: the stored form is a JSON string envelope", async () => {
  const store = new Map<string, string>();
  const { cache, clock } = build({}, store);
  await cache.set("k", { n: 1 }, { ttlMs: 500 });
  const [raw] = [...store.values()];
  assert.deepEqual(JSON.parse(raw ?? "null"), {
    schemaVersion: 1,
    storedAt: clock.now(),
    ttlMs: 500,
    value: { n: 1 },
  });
});

test("cache/memory: logs are redacted outside local and dev but still name the step", async () => {
  const { cache, logger, plantRaw } = build({}, undefined, "app", "prod");
  plantRaw("k", "garbage");
  await cache.get("k", V);
  assert.equal(logger.entries.length, 1);
  assert.equal(logger.entries[0]?.step, "adapter:cache/memory");
});

test("cache/memory: unmapped failures are unexpected", () => {
  assert.equal(errorMap.map(new Error("x")), "unexpected");
});
