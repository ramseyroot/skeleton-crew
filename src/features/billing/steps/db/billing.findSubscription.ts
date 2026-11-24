import { z } from "zod";
import { requireSignedIn } from "../../../../lib/authz.ts";
import { err, makeError, ok } from "../../../../lib/result.ts";
import { defineStep } from "../../../../lib/step.ts";
import { CancelTargetSchema, PrincipalSchema } from "../../domain.ts";

/** Finds the caller's active subscription. Without one there is nothing to cancel. */
export const findSubscription = defineStep({
  name: "db.billing.findSubscription",
  class: "db",
  input: z.object({ principal: PrincipalSchema }),
  output: CancelTargetSchema,
  permissions: { reads: ["subscriptions"], writes: [], storage: [] },
  errors: ["unauthorized", "not_found", "network", "unexpected"],
  uses: ["database"],
  run: async (input, ctx) => {
    const who = requireSignedIn(input.principal, { step: "db.billing.findSubscription", stripId: ctx.stripId });
    if (!who.ok) return who;
    const found = await ctx.database.read("subscriptions").findBy("accountId", who.value.accountId);
    if (!found.ok) return err(found.error);
    const row = found.value[0];
    if (!row || row.status !== "active") {
      return err(makeError("not_found", "db.billing.findSubscription", ctx.stripId, "no active subscription", { audience: "user", userMessage: "You have no active subscription." }));
    }
    return ok({ accountId: who.value.accountId, reference: String(row.reference), planId: String(row.planId) });
  },
});
