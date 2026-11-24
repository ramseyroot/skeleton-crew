// Payments port (platform parts requirement 8, design 3.2).
//
// Semantics:
// - Money is an integer in minor units (kobo, pesewas, cents) plus an ISO currency code. No floats, ever.
// - `createCheckout` returns a URL to send the customer to and a `reference`. The plan does NOT change when the
//   customer comes back from that URL: it changes only when a verified webhook event arrives (billing, requirement 9.2).
// - `parseWebhook` verifies the provider's signature over the RAW body in constant time, then parses the event.
//   A bad or missing signature is `unauthorized`. A signed body of an unknown shape is `validation`.
//   An event type we do not handle is returned as `{ type: "ignored" }`, so the route can still answer 200.
// - Event ids are stable: the same provider event delivered twice has the same `id`, so the caller can store ids and
//   change state once (idempotency).
// - Capability flags say what an adapter cannot do (refund, payout, split, cancel). Calling an unsupported method
//   returns `forbidden`.
// - No secret ever appears in an error message or a return value.
//
// Adapters: fake (offline, signs its own webhooks), paystack (fetch against api.paystack.co; tested with recorded
// shapes), none (every call is `forbidden`, for an app that has no billing).
// Planned adapters (not built): Stripe.

import type { Result } from "../lib/result.ts";

export type Money = { amountMinor: number; currency: string };

export type PaymentEvent =
  | { id: string; type: "payment.succeeded" | "payment.failed"; reference: string; accountId: string; planId: string; money: Money }
  | { id: string; type: "subscription.cancelled"; reference: string; accountId?: string }
  | { id: string; type: "ignored"; name: string };

export type PaymentCapabilities = { refund: boolean; payout: boolean; split: boolean; cancel: boolean };

export interface Payments {
  readonly name: string;
  readonly capabilities: PaymentCapabilities;
  createCheckout(input: { accountId: string; email: string; planId: string; money: Money; returnUrl: string }): Promise<Result<{ url: string; reference: string }>>;
  getSubscription(reference: string): Promise<Result<{ status: "active" | "cancelled" | "unknown" }>>;
  cancelSubscription(reference: string): Promise<Result<void>>;
  parseWebhook(input: { headers: Record<string, string>; rawBody: string }): Promise<Result<PaymentEvent>>;
}

/** Checks money the same way in every adapter. Returns a message, or null when it is fine. */
export function moneyProblem(money: Money): string | null {
  if (!Number.isInteger(money.amountMinor) || money.amountMinor < 1) return "amountMinor must be a whole number of minor units, at least 1";
  if (!/^[A-Z]{3}$/.test(money.currency)) return "currency must be a three-letter ISO code in capitals";
  return null;
}
