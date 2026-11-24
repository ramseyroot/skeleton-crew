import { defineStep } from "../../../../lib/step.ts";
import { PaymentEventSchema, WebhookInputSchema } from "../../domain.ts";

/** Verifies the provider's signature over the raw body and parses the event. A bad signature is `unauthorized`. */
export const parseWebhook = defineStep({
  name: "api.billing.parseWebhook",
  class: "api",
  input: WebhookInputSchema,
  output: PaymentEventSchema,
  permissions: { reads: [], writes: [], storage: [] },
  errors: ["unauthorized", "validation", "network", "unexpected"],
  uses: ["payments"],
  // Headers hold the signature and the body holds customer details, so nothing of them is logged.
  sensitive: true,
  run: (input, ctx) => ctx.payments.parseWebhook({ headers: input.headers, rawBody: input.rawBody }),
});
