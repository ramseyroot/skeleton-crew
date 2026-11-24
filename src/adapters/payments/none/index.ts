import { portError } from "../../../lib/port-error.ts";
import { err } from "../../../lib/result.ts";
import type { Payments } from "../../../ports/payments.ts";

/** For an app without billing: every call is `forbidden`, so nothing can charge anyone by accident. */
export function createNonePayments(): Payments {
  const refuse = async (what: string) => err(portError("forbidden", "payments/none", `payments are not configured (${what})`));
  return {
    name: "none",
    capabilities: { refund: false, payout: false, split: false, cancel: false },
    createCheckout: () => refuse("createCheckout"),
    getSubscription: () => refuse("getSubscription"),
    cancelSubscription: () => refuse("cancelSubscription"),
    parseWebhook: () => refuse("parseWebhook"),
  };
}
