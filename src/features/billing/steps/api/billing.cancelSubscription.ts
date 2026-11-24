import { err, ok } from "../../../../lib/result.ts";
import { defineStep } from "../../../../lib/step.ts";
import { CancelTargetSchema } from "../../domain.ts";

/** Cancels with the provider. A provider that cannot cancel answers `forbidden`. */
export const cancelSubscription = defineStep({
  name: "api.billing.cancelSubscription",
  class: "api",
  input: CancelTargetSchema,
  output: CancelTargetSchema,
  permissions: { reads: [], writes: [], storage: [] },
  errors: ["not_found", "forbidden", "upstream", "network", "unexpected"],
  uses: ["payments"],
  run: async (input, ctx) => {
    const cancelled = await ctx.payments.cancelSubscription(input.reference);
    if (!cancelled.ok) return err(cancelled.error);
    return ok(input);
  },
});
