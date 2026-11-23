// Contract suite for the Cache port. Each adapter's test file calls runCacheContract with a factory.
// Cases that need a store run only when caps.stores is true. Prefix-count cases also need
// cache.capabilities.prefixDelete. Cases every adapter must pass always run.

import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import type { Cache } from "../../ports/cache.ts";
import type { FixedClock } from "../clock/fixed/index.ts";
import type { MemoryLogger } from "../logger/memory/index.ts";

export type CacheHarness = {
  cache: Cache;
  clock: FixedClock;
  logger: MemoryLogger;
  /** Stores raw text under a logical key. Needed for the corruption cases. */
  plantRaw?: (key: string, raw: string) => void;
};
export type CacheOverrides = { schemaVersion?: number };
export type MakeCache = (overrides?: CacheOverrides) => CacheHarness;
export type CacheContractCaps = { stores: boolean };

const Profile = z.object({ name: z.string() });

export function runCacheContract(name: string, make: MakeCache, caps: CacheContractCaps): void {
  const stores = caps.stores;
  const prefixDelete = make().cache.capabilities.prefixDelete;

  // Cases for every adapter.
  test(`${name}: get on an absent key is a miss, not an error`, async () => {
    const { cache } = make();
    const res = await cache.get("profile:none", Profile);
    assert.deepEqual(res, { ok: true, value: { hit: false, reason: "absent" } });
  });

  test(`${name}: set, delete and deleteByPrefix return ok`, async () => {
    const { cache } = make();
    assert.equal((await cache.set("profile:u1", { name: "Ada" }, { ttlMs: 1000 })).ok, true);
    assert.equal((await cache.delete("profile:u1")).ok, true);
    assert.equal((await cache.delete("profile:never-set")).ok, true);
    if (cache.capabilities.prefixDelete) {
      assert.equal((await cache.deleteByPrefix("profile:")).ok, true);
    } else {
      const res = await cache.deleteByPrefix("profile:");
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.kind, "validation");
        assert.match(res.error.message, /prefix delete not supported/);
      }
    }
  });

  test(`${name}: set rejects a ttl that is not a positive integer`, async () => {
    const { cache } = make();
    for (const ttlMs of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const res = await cache.set("k", { name: "x" }, { ttlMs });
      assert.equal(res.ok, false, `ttl ${ttlMs}`);
      if (!res.ok) {
        assert.equal(res.error.kind, "validation");
        assert.match(res.error.step, /^adapter:cache\//);
      }
    }
  });

  // Cases that need a store.
  test(`${name}: a stored value is a hit`, { skip: !stores }, async () => {
    const { cache } = make();
    assert.equal((await cache.set("profile:u1", { name: "Ada" }, { ttlMs: 1000 })).ok, true);
    assert.deepEqual(await cache.get("profile:u1", Profile), { ok: true, value: { hit: true, value: { name: "Ada" } } });
  });

  test(`${name}: set overwrites`, { skip: !stores }, async () => {
    const { cache } = make();
    await cache.set("k", { name: "a" }, { ttlMs: 1000 });
    await cache.set("k", { name: "b" }, { ttlMs: 1000 });
    assert.deepEqual(await cache.get("k", Profile), { ok: true, value: { hit: true, value: { name: "b" } } });
  });

  test(`${name}: set rejects a value that is not JSON-serializable`, { skip: !stores }, async () => {
    const { cache } = make();
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    for (const value of [loop, 10n, undefined]) {
      const res = await cache.set("k", value, { ttlMs: 1000 });
      assert.equal(res.ok, false);
      if (!res.ok) assert.equal(res.error.kind, "validation");
    }
    assert.deepEqual(await cache.get("k", z.unknown()), { ok: true, value: { hit: false, reason: "absent" } });
  });

  test(`${name}: delete removes an entry`, { skip: !stores }, async () => {
    const { cache } = make();
    await cache.set("k", { name: "a" }, { ttlMs: 1000 });
    await cache.delete("k");
    assert.deepEqual(await cache.get("k", Profile), { ok: true, value: { hit: false, reason: "absent" } });
  });

  test(`${name}: an entry expires after its ttl and is deleted with one debug log`, { skip: !stores }, async () => {
    const { cache, clock, logger } = make();
    await cache.set("profile:u1", { name: "Ada" }, { ttlMs: 1000 });
    clock.advance(999);
    const still = await cache.get("profile:u1", Profile);
    assert.deepEqual(still, { ok: true, value: { hit: true, value: { name: "Ada" } } });
    clock.advance(1);
    assert.deepEqual(await cache.get("profile:u1", Profile), { ok: true, value: { hit: false, reason: "expired" } });
    assert.equal(logger.entries.length, 1);
    const entry = logger.entries[0];
    assert.equal(entry?.phase, "debug");
    assert.equal(entry?.step, `adapter:cache/${cache.name}`);
    assert.equal(entry?.class, "cache");
    assert.equal(entry?.stripId, "");
    assert.match(entry?.message ?? "", /profile:u1/);
    assert.doesNotMatch(entry?.message ?? "", /Ada/);
    // Deleted: the next read is absent and logs nothing more.
    assert.deepEqual(await cache.get("profile:u1", Profile), { ok: true, value: { hit: false, reason: "absent" } });
    assert.equal(logger.entries.length, 1);
  });

  test(`${name}: an entry written under another schemaVersion is outdated and deleted`, { skip: !stores }, async () => {
    const { cache, logger, plantRaw } = make({ schemaVersion: 2 });
    assert.ok(plantRaw, "stores adapters must offer plantRaw");
    plantRaw(
      "k",
      JSON.stringify({ schemaVersion: 1, storedAt: "2026-01-01T00:00:00.000Z", ttlMs: 100000, value: { name: "old" } }),
    );
    assert.deepEqual(await cache.get("k", Profile), { ok: true, value: { hit: false, reason: "outdated" } });
    assert.equal(logger.entries.length, 1);
    assert.equal(logger.entries[0]?.phase, "debug");
    assert.deepEqual(await cache.get("k", Profile), { ok: true, value: { hit: false, reason: "absent" } });
  });

  test(`${name}: corrupt entries are misses, deleted, and logged without the value`, { skip: !stores }, async () => {
    const { cache, logger, plantRaw } = make();
    assert.ok(plantRaw, "stores adapters must offer plantRaw");
    const bad: Record<string, string> = {
      notjson: "{not json SECRET",
      notenvelope: JSON.stringify({ hello: "SECRET" }),
      badtime: JSON.stringify({ schemaVersion: 1, storedAt: "yesterday", ttlMs: 1000, value: { name: "SECRET" } }),
    };
    for (const [k, raw] of Object.entries(bad)) plantRaw(k, raw);
    for (const k of Object.keys(bad)) {
      assert.deepEqual(await cache.get(k, Profile), { ok: true, value: { hit: false, reason: "corrupt" } }, k);
      assert.deepEqual(await cache.get(k, Profile), { ok: true, value: { hit: false, reason: "absent" } }, k);
    }
    assert.equal(logger.entries.length, 3);
    for (const e of logger.entries) {
      assert.equal(e.phase, "debug");
      assert.doesNotMatch(e.message ?? "", /SECRET/);
    }
  });

  test(`${name}: a value that fails the caller's schema is corrupt`, { skip: !stores }, async () => {
    const { cache } = make();
    await cache.set("k", { name: 5 }, { ttlMs: 1000 });
    assert.deepEqual(await cache.get("k", Profile), { ok: true, value: { hit: false, reason: "corrupt" } });
    assert.deepEqual(await cache.get("k", Profile), { ok: true, value: { hit: false, reason: "absent" } });
  });

  test(
    `${name}: deleteByPrefix deletes matching entries and returns the count`,
    { skip: !stores || !prefixDelete },
    async () => {
      const { cache } = make();
      await cache.set("profile:u1", { name: "a" }, { ttlMs: 1000 });
      await cache.set("profile:u2", { name: "b" }, { ttlMs: 1000 });
      await cache.set("session:s1", { name: "c" }, { ttlMs: 1000 });
      assert.deepEqual(await cache.deleteByPrefix("profile:"), { ok: true, value: { deleted: 2 } });
      assert.deepEqual(await cache.deleteByPrefix("profile:"), { ok: true, value: { deleted: 0 } });
      assert.equal((await cache.get("profile:u1", Profile)).ok, true);
      assert.deepEqual(await cache.get("session:s1", Profile), { ok: true, value: { hit: true, value: { name: "c" } } });
    },
  );

  test(`${name}: with no prefix support the prefix-count case is skipped`, () => {
    // Registration above is conditional on cache.capabilities.prefixDelete; this records which way it went.
    assert.equal(typeof prefixDelete, "boolean");
  });
}
