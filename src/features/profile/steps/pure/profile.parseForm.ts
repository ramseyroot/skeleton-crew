import { z } from "zod";
import { err, makeError } from "../../../../lib/result.ts";
import { defineStep } from "../../../../lib/step.ts";

/** Trims the display name and checks its length. The only step in profile.save that shows the user a message. */
export const parseProfileForm = defineStep({
  name: "pure.profile.parseForm",
  class: "pure",
  input: z.object({ userId: z.string().min(1), displayName: z.string() }),
  output: z.object({ userId: z.string().min(1), displayName: z.string().min(1).max(60) }),
  permissions: { reads: [], writes: [], storage: [] },
  errors: ["validation"],
  run: (input, ctx) => {
    const displayName = input.displayName.trim();
    if (displayName.length < 1 || displayName.length > 60) {
      return err(
        makeError("validation", "pure.profile.parseForm", ctx.stripId, `display name has ${displayName.length} characters`, {
          audience: "user",
          userMessage: "Please enter a name between 1 and 60 characters.",
        }),
      );
    }
    return { userId: input.userId, displayName };
  },
});
