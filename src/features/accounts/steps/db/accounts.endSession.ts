import { z } from "zod";
import { ok } from "../../../../lib/result.ts";
import { defineStep } from "../../../../lib/step.ts";

/** Ends one session. An unknown token counts as ended. */
export const endAccountSession = defineStep({
  name: "db.accounts.endSession",
  class: "db",
  input: z.object({ token: z.string() }),
  output: z.object({ ended: z.literal(true) }),
  permissions: { reads: [], writes: ["sessions"], storage: [] },
  errors: ["network", "unexpected"],
  uses: ["auth"],
  sensitive: true,
  run: async (input, ctx) => {
    const ended = await ctx.auth.endSession(input.token);
    if (!ended.ok) return ended;
    return ok({ ended: true as const });
  },
});
