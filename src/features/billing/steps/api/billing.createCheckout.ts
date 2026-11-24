import { err, ok } from "../../../../lib/result.ts";
import { defineStep } from "../../../../lib/step.ts";
import { CheckoutPlanSchema, CheckoutSchema } from "../../domain.ts";

/** Starts a checkout with the payment provider. The plan changes later, when a verified webhook arrives. */
export const createCheckout = defineStep({
  name: "api.billing.createCheckout",
  class: "api",
  input: CheckoutPlanSchema,
  output: CheckoutSchema,
  permissions: { reads: ["accounts"], writes: [], storage: [] },
  errors: ["not_found", "validation", "forbidden", "upstream", "network", "unexpected"],
  uses: ["auth", "payments"],
  run: async (input, ctx) => {
    const account = await ctx.auth.getAccount(input.accountId);
    if (!account.ok) return err(account.error);
    const started = await ctx.payments.createCheckout({
      accountId: input.accountId,
      email: account.value.email,
      planId: input.plan.id,
      money: { amountMinor: input.plan.priceMinor, currency: input.plan.currency },
      returnUrl: input.returnUrl,
    });
    if (!started.ok) return err(started.error);
    return ok(started.value);
  },
});
