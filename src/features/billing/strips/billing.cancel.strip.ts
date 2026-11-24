import { defineStrip } from "../../../lib/strip.ts";
import { cancelSubscription } from "../steps/api/billing.cancelSubscription.ts";
import { findSubscription } from "../steps/db/billing.findSubscription.ts";
import { markCancelled } from "../steps/db/billing.markCancelled.ts";

/**
 * billing.cancel: a signed-in user cancels their subscription.
 *
 * Trigger:     the cancel button on the billing page (Server Action), input `{ principal }`.
 * End states:  success   -> `{ accountId, status: "cancelled" }`. From the next request the plan is `free`.
 *              user error -> a toast: not signed in, or no active subscription.
 *              internal   -> a generic message with the stripId as a reference: the provider cannot cancel, or is down.
 * Side effects: asks the provider to cancel, then writes the subscription. If the provider refuses, nothing is written.
 */
export const cancel = defineStrip({
  name: "billing.cancel",
  budget: { reads: ["subscriptions"], writes: ["subscriptions"], storage: [] },
  steps: [findSubscription, cancelSubscription, markCancelled],
  invalidates: [],
  routing: {
    "db.billing.findSubscription": { unauthorized: "toast", not_found: "toast", network: "retry:2" },
    "api.billing.cancelSubscription": { network: "retry:2" },
    "db.billing.markCancelled": { network: "retry:2" },
    "*": "abort",
  },
});
