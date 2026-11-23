import { z } from "zod";
import { err, makeError, ok } from "../../lib/result.ts";
import { defineStep } from "../../lib/step.ts";
import { ProfileSchema } from "../../domain/profile.ts";

/**
 * Returns the cached profile when there is one, otherwise reads the user.
 * It takes `cached` because a strip passes each step only the previous step's output.
 */
export const findUserProfile = defineStep({
  name: "db.user.findProfile",
  class: "db",
  input: z.object({ userId: z.string(), cached: ProfileSchema.nullish() }),
  output: ProfileSchema,
  permissions: { reads: ["users"], writes: [], storage: [] },
  errors: ["not_found", "network", "unexpected"],
  uses: ["database"],
  run: async (input, ctx) => {
    if (input.cached) return ok(input.cached);
    const found = await ctx.database.read("users").get(input.userId);
    if (!found.ok) return found;
    if (found.value === null) {
      return err(makeError("not_found", "db.user.findProfile", ctx.stripId, `no user ${input.userId}`));
    }
    return ok({ userId: found.value.id, displayName: String(found.value.displayName) });
  },
});
