import { defineStrip } from "../../../lib/strip.ts";
import { currentPlan } from "../steps/db/billing.currentPlan.ts";

/**
 * billing.plan: the plan and limits of an account, with the plans on offer.
 *
 * Trigger:     the billing page renders, and the API pipeline on every request, input `{ principal }`.
 * End states:  success   -> `{ plan, subscription, available }`. With no active subscription the plan is `free`.
 *              user error -> a toast: not signed in.
 *              internal   -> a generic message with the stripId as a reference.
 * Side effects: none. Nothing is cached, so a plan change takes effect on the next request.
 */
export const plan = defineStrip({
  name: "billing.plan",
  budget: { reads: ["plans", "subscriptions"], writes: [], storage: [] },
  steps: [currentPlan],
  invalidates: [],
  routing: {
    "db.billing.currentPlan": { unauthorized: "toast", network: "retry:2" },
    "*": "abort",
  },
});
