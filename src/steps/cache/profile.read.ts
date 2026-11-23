import { z } from "zod";
import { ok } from "../../lib/result.ts";
import { defineStep } from "../../lib/step.ts";
import { ProfileSchema, profileCacheKey } from "../../domain/profile.ts";

/** Looks for a cached profile. A miss is a normal value (`cached: null`), never an error. */
export const readCachedProfile = defineStep({
  name: "cache.profile.read",
  class: "cache",
  input: z.object({ userId: z.string() }),
  output: z.object({ userId: z.string(), cached: ProfileSchema.nullable() }),
  permissions: { reads: ["cache:profile"], writes: [], storage: [] },
  errors: ["network", "unexpected"],
  uses: ["cache"],
  run: async (input, ctx) => {
    const read = await ctx.cache.get(profileCacheKey(input.userId), ProfileSchema);
    if (!read.ok) return read;
    return ok({ userId: input.userId, cached: read.value.hit ? read.value.value : null });
  },
});
