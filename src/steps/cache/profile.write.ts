import { ok } from "../../lib/result.ts";
import { defineStep } from "../../lib/step.ts";
import { PROFILE_TTL_MS, ProfileSchema, profileCacheKey } from "../../domain/profile.ts";

/** Stores one profile for a minute. */
export const writeCachedProfile = defineStep({
  name: "cache.profile.write",
  class: "cache",
  input: ProfileSchema,
  output: ProfileSchema,
  permissions: { reads: [], writes: ["cache:profile"], storage: [] },
  errors: ["network", "unexpected"],
  uses: ["cache"],
  run: async (input, ctx) => {
    const stored = await ctx.cache.set(profileCacheKey(input.userId), input, { ttlMs: PROFILE_TTL_MS });
    return stored.ok ? ok(input) : stored;
  },
});
