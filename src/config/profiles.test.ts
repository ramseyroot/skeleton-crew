import assert from "node:assert/strict";
import { test } from "node:test";
import { crossProfileProblems, profileSchema, profiles } from "./profiles.ts";
import type { Profile } from "./profiles.ts";

const parsed = (name: keyof typeof profiles): Profile => profileSchema.parse(profiles[name]);

test("local, dev and prod all parse with the schema", () => {
  for (const name of ["local", "dev", "prod"] as const) {
    const r = profileSchema.safeParse(profiles[name]);
    assert.equal(r.success, true, `${name}: ${r.success ? "" : r.error.message}`);
    assert.equal(profiles[name].env, name);
  }
});

test("the shipped profiles are consistent with each other", () => {
  const all = { local: parsed("local"), dev: parsed("dev"), prod: parsed("prod") };
  assert.deepEqual(crossProfileProblems(all), []);
  assert.deepEqual(all.local.allowedHosts, ["localhost", "127.0.0.1"]);
});

test("the schema rejects unknown fields, unknown adapters and missing parts", () => {
  assert.equal(profileSchema.safeParse({ ...profiles.local, extra: 1 }).success, false);
  assert.equal(profileSchema.safeParse({ ...profiles.local, adapters: { ...profiles.local.adapters, cache: "kv" } }).success, false);
  const { env: _env, ...noEnv } = profiles.dev;
  assert.equal(profileSchema.safeParse(noEnv).success, false);
});

test("outside local, the clock must be the system clock and ids must be uuids", () => {
  const dev = { ...profiles.dev, adapters: { ...profiles.dev.adapters, clock: "fixed", ids: "sequence" } };
  const r = profileSchema.safeParse(dev);
  assert.equal(r.success, false);
  if (!r.success) assert.equal(r.error.issues.length, 2);
  assert.equal(profileSchema.safeParse({ ...profiles.local, adapters: { ...profiles.local.adapters, clock: "fixed" } }).success, true);
});

test("prod must not keep its database or files in memory", () => {
  const prod = { ...profiles.prod, adapters: { ...profiles.prod.adapters, database: "memory", storage: "memory" } };
  const r = profileSchema.safeParse(prod);
  assert.equal(r.success, false);
  if (!r.success) assert.equal(r.error.issues.length, 2);
  assert.equal(profileSchema.safeParse({ ...profiles.dev, adapters: { ...profiles.dev.adapters, database: "memory" } }).success, true);
});

test("cross-profile problems: non-local host in local, prod host in dev, shared paths", () => {
  const base = { local: parsed("local"), dev: parsed("dev"), prod: parsed("prod") };
  const withHosts = {
    ...base,
    local: { ...base.local, allowedHosts: ["localhost", "db.example.com"] },
    dev: { ...base.dev, allowedHosts: ["api.shop.com"] },
    prod: { ...base.prod, allowedHosts: ["api.shop.com"] },
  };
  const problems = crossProfileProblems(withHosts);
  assert.equal(problems.some((p) => /local may only allow local hosts.*db\.example\.com/.test(p)), true);
  assert.equal(problems.some((p) => /dev lists production host.*api\.shop\.com/.test(p)), true);

  const shared = crossProfileProblems({ ...base, dev: { ...base.dev, paths: { database: base.local.paths.database! } } });
  assert.equal(shared.some((p) => /share the database path/.test(p)), true);
});
