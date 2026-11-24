import { defineStrip } from "../../../lib/strip.ts";
import { parseWebhook } from "../steps/api/billing.parseWebhook.ts";
import { recordEvent } from "../steps/db/billing.recordEvent.ts";
import { setPlan } from "../steps/db/billing.setPlan.ts";

/**
 * billing.webhook: the payment provider tells us what happened.
 *
 * Trigger:     `POST /api/webhooks/payments`, input `{ headers, rawBody }` (the raw text, for the signature).
 * End states:  success      -> `{ applied, reason }`. The route answers 200 for every success, including a duplicate,
 *                              an ignored event, a failed payment and a refused amount, so the provider stops retrying.
 *              unauthorized -> the signature is missing or wrong: the route answers 401.
 *              validation   -> a signed body of an unknown shape: the route answers 400.
 *              internal     -> the event could not be stored or applied: the route answers 500 and the provider retries.
 * Side effects: stores the event id, and in one atomic batch changes the subscription and marks the event applied.
 *              The same event delivered twice changes state once.
 * Sensitive:   headers and the body are never logged or reported.
 */
export const webhook = defineStrip({
  name: "billing.webhook",
  budget: { reads: ["plans", "subscriptions", "payment_events"], writes: ["subscriptions", "payment_events"], storage: [] },
  steps: [parseWebhook, recordEvent, setPlan],
  invalidates: [],
  routing: {
    "api.billing.parseWebhook": "abort",
    "db.billing.recordEvent": { network: "retry:2" },
    "db.billing.setPlan": { network: "retry:2" },
    "*": "abort",
  },
});
