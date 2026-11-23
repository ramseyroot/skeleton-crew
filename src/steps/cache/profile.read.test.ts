import assert from "node:assert/strict";
import { test } from "node:test";
import { CACHE_KINDS, makeTestPorts } from "../../test-utils/ports.ts";
import { readCachedProfile } from "./profile.read.ts";

for (const cache of CACHE_KINDS) {
  test(`cache.profile.read (${cache}): a miss is a value, not an error`, async () => {
    const { ports } = await makeTestPorts({ cache });
    const r = await readCachedProfile.execute({ userId: "u1" }, { stripId: "s", ports });
    assert.deepEqual(r, { ok: true, value: { userId: "u1", cached: null } });
  });
}

test("cache.profile.read (memory): a stored profile is returned", async () => {
  const { ports } = await makeTestPorts({ cache: "memory" });
  await ports.cache.set("profile:u1", { userId: "u1", displayName: "Ada" }, { ttlMs: 1000 });
  const r = await readCachedProfile.execute({ userId: "u1" }, { stripId: "s", ports });
  assert.deepEqual(r, { ok: true, value: { userId: "u1", cached: { userId: "u1", displayName: "Ada" } } });
});

test("cache.profile.read (memory): a corrupt entry is a miss", async () => {
  const { ports } = await makeTestPorts({ cache: "memory" });
  await ports.cache.set("profile:u1", { wrong: true }, { ttlMs: 1000 });
  const r = await readCachedProfile.execute({ userId: "u1" }, { stripId: "s", ports });
  assert.deepEqual(r, { ok: true, value: { userId: "u1", cached: null } });
});
