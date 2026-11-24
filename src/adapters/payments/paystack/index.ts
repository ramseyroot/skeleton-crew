// The Paystack adapter: plain `fetch` against api.paystack.co, no SDK.
// Request and webhook shapes follow Paystack's documentation: POST /transaction/initialize returns
// data.authorization_url and data.reference; GET /transaction/verify/<reference> returns data.status; webhooks carry
// `x-paystack-signature`, the hex HMAC-SHA512 of the raw body keyed with the secret key.
// The secret key is never put in an error or a log: only HTTP status and Paystack's public `message` are.

import { portError } from "../../../lib/port-error.ts";
import { err, ok } from "../../../lib/result.ts";
import type { ErrorKind, Result } from "../../../lib/result.ts";
import type { IdGenerator } from "../../../ports/ids.ts";
import { moneyProblem } from "../../../ports/payments.ts";
import type { PaymentEvent, Payments } from "../../../ports/payments.ts";
import { header, hmacSha512Hex, safeEqualHex } from "../signing.ts";
import { errorMap } from "./errors.ts";

export const PAYSTACK_SIGNATURE_HEADER = "x-paystack-signature";
const NAME = "payments/paystack";

export type PaystackOptions = {
  secretKey: string;
  ids: IdGenerator;
  /** Defaults to the platform fetch. Tests pass recorded responses. */
  fetch?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
};

type Json = Record<string, unknown>;

const asJson = (v: unknown): Json => (typeof v === "object" && v !== null ? (v as Json) : {});

function kindForStatus(status: number): { kind: ErrorKind; retryable: boolean } {
  if (status === 401 || status === 403) return { kind: "unauthorized", retryable: false };
  if (status === 404) return { kind: "not_found", retryable: false };
  if (status === 429) return { kind: "rate_limited", retryable: true };
  if (status >= 500) return { kind: "upstream", retryable: true };
  return { kind: "validation", retryable: false };
}

export function createPaystackPayments(options: PaystackOptions): Payments {
  const base = options.baseUrl ?? "https://api.paystack.co";
  const doFetch = options.fetch ?? globalThis.fetch;

  async function call(method: "GET" | "POST", path: string, body?: Json): Promise<Result<Json>> {
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, {
        method,
        headers: { authorization: `Bearer ${options.secretKey}`, "content-type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      });
    } catch (thrown) {
      return err(portError("network", NAME, `could not reach Paystack (${thrown instanceof Error ? thrown.name : "error"})`, { retryable: true }));
    }
    let json: Json;
    try {
      json = asJson(await response.json());
    } catch {
      return err(portError("upstream", NAME, `Paystack answered ${response.status} with a body that is not JSON`, { retryable: response.status >= 500 }));
    }
    if (!response.ok || json.status === false) {
      const { kind, retryable } = kindForStatus(response.status);
      const message = typeof json.message === "string" ? json.message.slice(0, 200) : "no message";
      return err(portError(kind, NAME, `Paystack answered ${response.status}: ${message}`, { retryable }));
    }
    return ok(json);
  }

  return {
    name: "paystack",
    capabilities: { refund: false, payout: false, split: false, cancel: false },

    async createCheckout(input) {
      const problem = moneyProblem(input.money);
      if (problem) return err(portError("validation", NAME, problem));
      if (input.email === "" || input.accountId === "" || input.planId === "") return err(portError("validation", NAME, "email, accountId and planId are required"));
      try {
        new URL(input.returnUrl);
      } catch {
        return err(portError("validation", NAME, "returnUrl must be a full URL"));
      }
      const reference = `ps_${options.ids.next()}`;
      const r = await call("POST", "/transaction/initialize", {
        email: input.email,
        amount: input.money.amountMinor,
        currency: input.money.currency,
        reference,
        callback_url: input.returnUrl,
        metadata: { accountId: input.accountId, planId: input.planId },
      });
      if (!r.ok) return r;
      const data = asJson(r.value.data);
      if (typeof data.authorization_url !== "string" || typeof data.reference !== "string") {
        return err(portError("upstream", NAME, "Paystack answered without an authorization_url and reference"));
      }
      return ok({ url: data.authorization_url, reference: data.reference });
    },

    async getSubscription(reference) {
      const r = await call("GET", `/transaction/verify/${encodeURIComponent(reference)}`);
      if (!r.ok) return r;
      const status = asJson(r.value.data).status;
      return ok({ status: status === "success" ? ("active" as const) : ("unknown" as const) });
    },

    async cancelSubscription() {
      return err(portError("forbidden", NAME, "cancelling a subscription is not supported by this adapter yet (capability cancel is false)"));
    },

    async parseWebhook({ headers, rawBody }) {
      try {
        const given = header(headers, PAYSTACK_SIGNATURE_HEADER);
        if (given === undefined || !safeEqualHex(given, hmacSha512Hex(options.secretKey, rawBody))) {
          return err(portError("unauthorized", NAME, "webhook signature missing or wrong"));
        }
        let body: Json;
        try {
          body = asJson(JSON.parse(rawBody));
        } catch {
          return err(portError("validation", NAME, "webhook body is not JSON"));
        }
        const name = body.event;
        const data = asJson(body.data);
        if (typeof name !== "string") return err(portError("validation", NAME, "webhook body has no event name"));
        const metadata = asJson(data.metadata);
        const id = (suffix: unknown): string => `${name}:${String(suffix)}`;

        if (name === "charge.success" || name === "invoice.payment_failed") {
          const accountId = metadata.accountId;
          const planId = metadata.planId;
          const reference = data.reference;
          const amount = data.amount;
          const currency = data.currency;
          if (typeof accountId !== "string" || typeof planId !== "string" || typeof reference !== "string" || typeof amount !== "number" || typeof currency !== "string") {
            return err(portError("validation", NAME, `${name} is missing its reference, amount, currency or account metadata`));
          }
          const money = { amountMinor: amount, currency };
          if (moneyProblem(money)) return err(portError("validation", NAME, `${name} has an invalid amount or currency`));
          const event: PaymentEvent = { id: id(data.id ?? reference), type: name === "charge.success" ? "payment.succeeded" : "payment.failed", reference, accountId, planId, money };
          return ok(event);
        }
        if (name === "subscription.disable") {
          const code = data.subscription_code;
          if (typeof code !== "string") return err(portError("validation", NAME, "subscription.disable has no subscription_code"));
          return ok({ id: id(code), type: "subscription.cancelled" as const, reference: code, ...(typeof metadata.accountId === "string" ? { accountId: metadata.accountId } : {}) });
        }
        return ok({ id: id(data.id ?? "unknown"), type: "ignored" as const, name });
      } catch (thrown) {
        return err(portError(errorMap.map(thrown), NAME, "webhook could not be processed", { cause: thrown }));
      }
    },
  };
}
