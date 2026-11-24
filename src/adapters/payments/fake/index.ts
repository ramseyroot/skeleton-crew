import { portError } from "../../../lib/port-error.ts";
import { err, ok } from "../../../lib/result.ts";
import type { Result } from "../../../lib/result.ts";
import type { Clock } from "../../../ports/clock.ts";
import type { IdGenerator } from "../../../ports/ids.ts";
import { moneyProblem } from "../../../ports/payments.ts";
import type { Money, PaymentEvent, Payments } from "../../../ports/payments.ts";
import { header, hmacSha512Hex, safeEqualHex } from "../signing.ts";
import { errorMap } from "./errors.ts";

export const FAKE_SIGNATURE_HEADER = "x-fake-signature";
export const FAKE_SECRET = "fake-webhook-secret";

type Pending = { accountId: string; email: string; planId: string; money: Money; state: "pending" | "paid" | "failed" | "cancelled" };

export type FakePayments = Payments & {
  /**
   * What the "provider" would send to the webhook route when the customer pays or fails. The body is signed, so the
   * route's signature check runs for real, offline. Used by the fake checkout page and by tests.
   */
  signedEvent(reference: string, outcome: "success" | "failed" | "cancelled"): Result<{ headers: Record<string, string>; rawBody: string }>;
};

/** An offline payment provider. `baseUrl` is put in front of the checkout path ("" gives a relative URL). */
export function createFakePayments(deps: { clock: Clock; ids: IdGenerator; secret?: string; baseUrl?: string }): FakePayments {
  const secret = deps.secret ?? FAKE_SECRET;
  const pending = new Map<string, Pending>();

  const sign = (rawBody: string): Record<string, string> => ({ [FAKE_SIGNATURE_HEADER]: hmacSha512Hex(secret, rawBody) });

  return {
    name: "fake",
    capabilities: { refund: false, payout: false, split: false, cancel: true },

    async createCheckout(input) {
      const problem = moneyProblem(input.money);
      if (problem) return err(portError("validation", "payments/fake", problem));
      if (input.accountId === "" || input.planId === "") return err(portError("validation", "payments/fake", "accountId and planId are required"));
      const reference = `fake_${deps.ids.next()}`;
      pending.set(reference, { accountId: input.accountId, email: input.email, planId: input.planId, money: input.money, state: "pending" });
      return ok({ url: `${deps.baseUrl ?? ""}/billing/fake-checkout?reference=${encodeURIComponent(reference)}`, reference });
    },

    async getSubscription(reference) {
      const p = pending.get(reference);
      if (!p) return ok({ status: "unknown" as const });
      return ok({ status: p.state === "paid" ? ("active" as const) : p.state === "cancelled" ? ("cancelled" as const) : ("unknown" as const) });
    },

    async cancelSubscription(reference) {
      const p = pending.get(reference);
      if (!p) return err(portError("not_found", "payments/fake", "no such checkout"));
      p.state = "cancelled";
      return ok(undefined);
    },

    async parseWebhook({ headers, rawBody }) {
      try {
        const given = header(headers, FAKE_SIGNATURE_HEADER);
        if (given === undefined || !safeEqualHex(given, hmacSha512Hex(secret, rawBody))) {
          return err(portError("unauthorized", "payments/fake", "webhook signature missing or wrong"));
        }
        let body: unknown;
        try {
          body = JSON.parse(rawBody);
        } catch {
          return err(portError("validation", "payments/fake", "webhook body is not JSON"));
        }
        const b = body as { id?: unknown; type?: unknown; reference?: unknown; accountId?: unknown; planId?: unknown; money?: unknown };
        if (typeof b.id !== "string" || typeof b.type !== "string") return err(portError("validation", "payments/fake", "webhook body has no id or type"));
        if (b.type === "payment.succeeded" || b.type === "payment.failed") {
          const m = b.money as Money | undefined;
          if (typeof b.reference !== "string" || typeof b.accountId !== "string" || typeof b.planId !== "string" || !m || moneyProblem(m) !== null) {
            return err(portError("validation", "payments/fake", "payment event is missing its reference, account, plan or money"));
          }
          const event: PaymentEvent = { id: b.id, type: b.type, reference: b.reference, accountId: b.accountId, planId: b.planId, money: { amountMinor: m.amountMinor, currency: m.currency } };
          return ok(event);
        }
        if (b.type === "subscription.cancelled") {
          if (typeof b.reference !== "string") return err(portError("validation", "payments/fake", "cancel event has no reference"));
          return ok({ id: b.id, type: "subscription.cancelled" as const, reference: b.reference, ...(typeof b.accountId === "string" ? { accountId: b.accountId } : {}) });
        }
        return ok({ id: b.id, type: "ignored" as const, name: b.type });
      } catch (thrown) {
        return err(portError(errorMap.map(thrown), "payments/fake", "webhook could not be processed", { cause: thrown }));
      }
    },

    signedEvent(reference, outcome) {
      const p = pending.get(reference);
      if (!p) return err(portError("not_found", "payments/fake", "no such checkout"));
      const id = `evt_${reference}_${outcome}`;
      let body: Record<string, unknown>;
      if (outcome === "cancelled") {
        p.state = "cancelled";
        body = { id, type: "subscription.cancelled", reference, accountId: p.accountId };
      } else {
        p.state = outcome === "success" ? "paid" : "failed";
        body = { id, type: outcome === "success" ? "payment.succeeded" : "payment.failed", reference, accountId: p.accountId, planId: p.planId, money: p.money };
      }
      const rawBody = JSON.stringify(body);
      return ok({ headers: sign(rawBody), rawBody });
    },
  };
}
