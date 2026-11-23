import { z } from "zod";
import { err, makeError, ok } from "../../lib/result.ts";
import { defineStep } from "../../lib/step.ts";
import { ProfileSchema, nameFields } from "../../domain/profile.ts";

/** Changes one field of one user. A name that is already taken is a conflict the user can fix. */
export const setUserDisplayName = defineStep({
  name: "db.user.setDisplayName",
  class: "db",
  input: z.object({ userId: z.string(), displayName: z.string() }),
  output: ProfileSchema,
  permissions: { reads: [], writes: ["users"], storage: [] },
  errors: ["not_found", "conflict", "network", "unexpected"],
  uses: ["database"],
  run: async (input, ctx) => {
    const updated = await ctx.database.write("users").update(input.userId, nameFields(input.displayName));
    if (updated.ok) return ok({ userId: updated.value.id, displayName: String(updated.value.displayName) });
    if (updated.error.kind === "conflict") {
      return err(
        makeError("conflict", "db.user.setDisplayName", ctx.stripId, updated.error.message, {
          audience: "user",
          userMessage: "That name is taken. Please choose another.",
          cause: updated.error,
        }),
      );
    }
    return updated;
  },
});
