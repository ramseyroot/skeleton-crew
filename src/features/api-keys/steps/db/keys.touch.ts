import { ok } from "../../../../lib/result.ts";
import { defineStep } from "../../../../lib/step.ts";
import { VerifiedKeySchema } from "../../domain.ts";

/** Records that the key was just used, and passes the verified key on. A strip may skip this step when it fails. */
export const touchKey = defineStep({
  name: "db.keys.touch",
  class: "db",
  input: VerifiedKeySchema,
  output: VerifiedKeySchema,
  permissions: { reads: [], writes: ["api_keys"], storage: [] },
  errors: ["not_found", "network", "unexpected"],
  uses: ["database", "clock"],
  run: async (input, ctx) => {
    const touched = await ctx.database.write("api_keys").update(input.keyId, { lastUsedAt: ctx.clock.now() });
    if (!touched.ok) return touched;
    return ok(input);
  },
});
