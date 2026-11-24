// Shared by the billing steps, strips and pages. Schemas live here because a step file may export only steps (R09).

import { z } from "zod";
import type { CollectionDef, DbRecord } from "../../ports/database.ts";

export const PLANS: CollectionDef = {
  name: "plans",
  fields: {
    name: { type: "string", unique: true },
    priceMinor: { type: "number" },
    currency: { type: "string" },
    perMinute: { type: "number" },
    perMonth: { type: "number" },
    // A JSON list of feature names, because collections hold flat values only.
    features: { type: "string" },
  },
};
export const SUBSCRIPTIONS: CollectionDef = {
  name: "subscriptions",
  fields: {
    accountId: { type: "string", unique: true },
    planId: { type: "string" },
    status: { type: "string" },
    reference: { type: "string", indexed: true },
  },
};
/** One row per provider event. `state` is "received" until the event has been applied, then "applied". */
export const PAYMENT_EVENTS: CollectionDef = {
  name: "payment_events",
  fields: { eventId: { type: "string", unique: true }, state: { type: "string" } },
};
export const collections: CollectionDef[] = [PLANS, SUBSCRIPTIONS, PAYMENT_EVENTS];

export const PrincipalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user"), accountId: z.string(), role: z.enum(["user", "admin"]) }),
  z.object({ kind: z.literal("key"), accountId: z.string(), keyId: z.string(), role: z.enum(["user", "admin"]) }),
  z.object({ kind: z.literal("anonymous"), ip: z.string() }),
]);

export const PlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  priceMinor: z.number().int().min(0),
  currency: z.string(),
  perMinute: z.number().int().min(1),
  perMonth: z.number().int().min(1),
  features: z.array(z.string()),
});
export type Plan = z.infer<typeof PlanSchema>;

/** Reads a stored plan. A `features` value that is not a JSON list of text gives an empty list. */
export function toPlan(r: DbRecord): Plan {
  let features: string[] = [];
  try {
    const parsed: unknown = JSON.parse(String(r.features));
    if (Array.isArray(parsed)) features = parsed.filter((f): f is string => typeof f === "string");
  } catch {
    features = [];
  }
  return {
    id: r.id,
    name: String(r.name),
    priceMinor: Number(r.priceMinor),
    currency: String(r.currency),
    perMinute: Number(r.perMinute),
    perMonth: Number(r.perMonth),
    features,
  };
}

export const FREE_PLAN_ID = "free";

/** The plans every app starts with (design G5). Prices are in kobo. Numbers are proposals the builder can change. */
export const SEED_PLANS: readonly { id: string; name: string; priceMinor: number; currency: string; perMinute: number; perMonth: number; features: string[] }[] = [
  { id: "free", name: "Free", priceMinor: 0, currency: "NGN", perMinute: 60, perMonth: 1_000, features: ["basic"] },
  { id: "pro", name: "Pro", priceMinor: 500_000, currency: "NGN", perMinute: 600, perMonth: 100_000, features: ["basic", "advanced"] },
];

const Money = z.object({ amountMinor: z.number(), currency: z.string() });
export const PaymentEventSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string(), type: z.enum(["payment.succeeded", "payment.failed"]), reference: z.string(), accountId: z.string(), planId: z.string(), money: Money }),
  z.object({ id: z.string(), type: z.literal("subscription.cancelled"), reference: z.string(), accountId: z.string().optional() }),
  z.object({ id: z.string(), type: z.literal("ignored"), name: z.string() }),
]);

export const SubscriptionViewSchema = z.object({
  status: z.enum(["active", "cancelled"]),
  reference: z.string(),
  planId: z.string(),
});

export const CurrentPlanSchema = z.object({
  plan: PlanSchema,
  subscription: SubscriptionViewSchema.nullable(),
  /** Every plan on offer, for the billing page. */
  available: z.array(PlanSchema),
});
export type CurrentPlan = z.infer<typeof CurrentPlanSchema>;

export const CheckoutRequestSchema = z.object({ principal: PrincipalSchema, planId: z.string(), returnUrl: z.string() });
export const CheckedCheckoutSchema = z.object({ principal: PrincipalSchema, planId: z.string().min(1), returnUrl: z.string().min(1) });
export const CheckoutPlanSchema = z.object({ accountId: z.string(), plan: PlanSchema, returnUrl: z.string() });
export const CheckoutSchema = z.object({ url: z.string(), reference: z.string() });

export const WebhookInputSchema = z.object({ headers: z.record(z.string(), z.string()), rawBody: z.string() });
export const RecordedEventSchema = z.object({ event: PaymentEventSchema, duplicate: z.boolean() });
export const AppliedSchema = z.object({ applied: z.boolean(), reason: z.string() });

export const CancelTargetSchema = z.object({ accountId: z.string(), reference: z.string(), planId: z.string() });
