import { requireSignedIn } from "../../../../lib/authz.ts";
import { err, makeError, ok } from "../../../../lib/result.ts";
import { defineStep } from "../../../../lib/step.ts";
import { CheckedCheckoutSchema, CheckoutPlanSchema, toPlan } from "../../domain.ts";

/** Reads the plan to buy. An unknown plan, or a plan that costs nothing, is a message the user can act on. */
export const findPlan = defineStep({
  name: "db.billing.findPlan",
  class: "db",
  input: CheckedCheckoutSchema,
  output: CheckoutPlanSchema,
  permissions: { reads: ["plans"], writes: [], storage: [] },
  errors: ["unauthorized", "not_found", "validation", "network", "unexpected"],
  uses: ["database"],
  run: async (input, ctx) => {
    const who = requireSignedIn(input.principal, { step: "db.billing.findPlan", stripId: ctx.stripId });
    if (!who.ok) return who;
    const found = await ctx.database.read("plans").get(input.planId);
    if (!found.ok) return err(found.error);
    if (found.value === null) {
      return err(makeError("not_found", "db.billing.findPlan", ctx.stripId, `no plan ${input.planId}`, { audience: "user", userMessage: "That plan does not exist." }));
    }
    const plan = toPlan(found.value);
    if (plan.priceMinor < 1) {
      return err(makeError("validation", "db.billing.findPlan", ctx.stripId, `plan ${plan.id} is free`, { audience: "user", userMessage: "That plan is free, so it needs no payment." }));
    }
    return ok({ accountId: who.value.accountId, plan, returnUrl: input.returnUrl });
  },
});
