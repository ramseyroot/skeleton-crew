import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { cacheKey, unwrap, unwrapJson, wrap } from "./cache-envelope.ts";

const Profile = z.object({ id: z.string(), name: z.string() });
const NOW = "2026-11-23T12:00:00.000Z";
const LATER = "2026-11-23T12:00:30.000Z";
const opts = { schemaVersion: 1, now: NOW };

test("a valid entry is a hit", () => {
  const raw = wrap({ id: "u1", name: "Ada" }, { schemaVersion: 1, ttlMs: 60_000, now: NOW });
  assert.deepEqual(unwrap(raw, Profile, opts), { hit: true, value: { id: "u1", name: "Ada" } });
});

test("absent entries are misses", () => {
  assert.deepEqual(unwrap(undefined, Profile, opts), { hit: false, reason: "absent" });
  assert.deepEqual(unwrap(null, Profile, opts), { hit: false, reason: "absent" });
});

test("corrupt entries are misses and are never passed through", () => {
  for (const raw of ["text", 5, [], {}, { schemaVersion: 1 }, { schemaVersion: "1", storedAt: NOW, ttlMs: 1, value: {} }]) {
    assert.deepEqual(unwrap(raw, Profile, opts), { hit: false, reason: "corrupt" });
  }
});

test("a value that fails its schema is a miss", () => {
  const raw = wrap({ id: 1, name: "Ada" }, { schemaVersion: 1, ttlMs: 60_000, now: NOW });
  assert.deepEqual(unwrap(raw, Profile, opts), { hit: false, reason: "corrupt" });
});

test("a different schema version is outdated", () => {
  const raw = wrap({ id: "u1", name: "Ada" }, { schemaVersion: 2, ttlMs: 60_000, now: NOW });
  assert.deepEqual(unwrap(raw, Profile, opts), { hit: false, reason: "outdated" });
});

test("an expired entry is a miss, and the boundary counts as expired", () => {
  const raw = wrap({ id: "u1", name: "Ada" }, { schemaVersion: 1, ttlMs: 30_000, now: NOW });
  assert.equal(unwrap(raw, Profile, { schemaVersion: 1, now: "2026-11-23T12:00:29.999Z" }).hit, true);
  assert.deepEqual(unwrap(raw, Profile, { schemaVersion: 1, now: LATER }), { hit: false, reason: "expired" });
});

test("wrap rejects a bad ttl", () => {
  for (const ttlMs of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => wrap("x", { schemaVersion: 1, ttlMs, now: NOW }), RangeError);
  }
});

test("unwrapJson handles text, bad JSON and absence", () => {
  const text = JSON.stringify(wrap({ id: "u1", name: "Ada" }, { schemaVersion: 1, ttlMs: 60_000, now: NOW }));
  assert.equal(unwrapJson(text, Profile, opts).hit, true);
  assert.deepEqual(unwrapJson("{not json", Profile, opts), { hit: false, reason: "corrupt" });
  assert.deepEqual(unwrapJson(undefined, Profile, opts), { hit: false, reason: "absent" });
});

test("keys are namespaced by app, environment, adapter and version", () => {
  const base = { app: "demo", env: "local", adapter: "memory", schemaVersion: 1, key: "profile:u1" };
  assert.equal(cacheKey(base), "demo:local:memory:v1:profile:u1");
  assert.notEqual(cacheKey(base), cacheKey({ ...base, adapter: "kv" }));
  assert.notEqual(cacheKey(base), cacheKey({ ...base, env: "prod" }));
  assert.notEqual(cacheKey(base), cacheKey({ ...base, schemaVersion: 2 }));
});

test("a colon inside a namespace part cannot shift the other parts", () => {
  const a = cacheKey({ app: "a:b", env: "c", adapter: "m", schemaVersion: 1, key: "k" });
  const b = cacheKey({ app: "a", env: "b:c", adapter: "m", schemaVersion: 1, key: "k" });
  assert.notEqual(a, b);
});
