import { defineStrip } from "../../../lib/strip.ts";
import { createCheckout } from "../steps/api/billing.createCheckout.ts";
import { findPlan } from "../steps/db/billing.findPlan.ts";
import { parseCheckout } from "../steps/pure/billing.parseCheckout.ts";

/**
 * billing.checkout: a signed-in user starts paying for a plan.
 *
 * Trigger:     the upgrade button on the billing page (Server Action), input `{ principal, planId, returnUrl }`.
 * End states:  success   -> `{ url, reference }`: where to send the customer to pay.
 *              user error -> a toast: not signed in, no plan chosen, an unknown plan, or the free plan.
 *              internal   -> a generic message with the stripId as a reference: the provider is down or refuses.
 * Side effects: none on our data. The plan changes only when a verified webhook arrives (billing.webhook).
 */
export const checkout = defineStrip({
  name: "billing.checkout",
  budget: { reads: ["plans", "accounts"], writes: [], storage: [] },
  steps: [parseCheckout, findPlan, createCheckout],
  invalidates: [],
  routing: {
    "pure.billing.parseCheckout": { validation: "toast", unauthorized: "toast" },
    "db.billing.findPlan": { unauthorized: "toast", not_found: "toast", validation: "toast", network: "retry:2" },
    "api.billing.createCheckout": { network: "retry:2", upstream: "abort" },
    "*": "abort",
  },
});
