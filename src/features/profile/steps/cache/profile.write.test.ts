import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { PROFILE_TTL_MS, ProfileSchema } from "../../domain.ts";
import { CACHE_KINDS, makeTestPorts } from "../../testing.ts";
import { writeCachedProfile } from "./profile.write.ts";

const profile = { userId: "u1", displayName: "Ada" };

for (const cache of CACHE_KINDS) {
  test(`cache.profile.write (${cache}): returns the profile it was given`, async () => {
    const { ports } = await makeTestPorts({ cache });
    assert.deepEqual(await writeCachedProfile.execute(profile, { stripId: "s", ports }), { ok: true, value: profile });
  });
}

test("cache.profile.write (memory): the entry is readable until its ttl passes", async () => {
  const { ports, clock } = await makeTestPorts({ cache: "memory" });
  await writeCachedProfile.execute(profile, { stripId: "s", ports });
  const hit = await ports.cache.get("profile:u1", ProfileSchema);
  assert.equal(hit.ok && hit.value.hit, true);
  clock.advance(PROFILE_TTL_MS);
  const expired = await ports.cache.get("profile:u1", z.unknown());
  assert.equal(expired.ok && expired.value.hit, false);
});

test("cache.profile.write: it may write only the profile namespace", () => {
  assert.deepEqual(writeCachedProfile.manifest.permissions, { reads: [], writes: ["cache:profile"], storage: [] });
});
