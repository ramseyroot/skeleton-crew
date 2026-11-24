import { z } from "zod";
import { requireSignedIn } from "../../../../lib/authz.ts";
import { err, makeError, ok } from "../../../../lib/result.ts";
import { defineStep } from "../../../../lib/step.ts";
import { CurrentPlanSchema, FREE_PLAN_ID, PrincipalSchema, toPlan } from "../../domain.ts";

/** The account's plan and limits, with the plans on offer. With no active subscription the plan is `free`. */
export const currentPlan = defineStep({
  name: "db.billing.currentPlan",
  class: "db",
  input: z.object({ principal: PrincipalSchema }),
  output: CurrentPlanSchema,
  permissions: { reads: ["plans", "subscriptions"], writes: [], storage: [] },
  errors: ["unauthorized", "not_found", "network", "unexpected"],
  uses: ["database"],
  run: async (input, ctx) => {
    const who = requireSignedIn(input.principal, { step: "db.billing.currentPlan", stripId: ctx.stripId });
    if (!who.ok) return who;
    const plans = await ctx.database.read("plans").list({ limit: 200 });
    if (!plans.ok) return err(plans.error);
    const available = plans.value.items.map(toPlan).sort((a, b) => a.priceMinor - b.priceMinor);
    const subs = await ctx.database.read("subscriptions").findBy("accountId", who.value.accountId);
    if (!subs.ok) return err(subs.error);
    const row = subs.value[0];
    const subscription = row
      ? { status: row.status === "active" ? ("active" as const) : ("cancelled" as const), reference: String(row.reference), planId: String(row.planId) }
      : null;
    const planId = subscription?.status === "active" ? subscription.planId : FREE_PLAN_ID;
    const plan = available.find((p) => p.id === planId);
    if (!plan) return err(makeError("not_found", "db.billing.currentPlan", ctx.stripId, `plan ${planId} is not in the plans collection`));
    return ok({ plan, subscription, available });
  },
});
