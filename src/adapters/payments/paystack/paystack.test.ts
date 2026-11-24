import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createSequenceIds } from "../../ids/sequence/index.ts";
import { runPaymentsContract } from "../contract.test.ts";
import { hmacSha512Hex } from "../signing.ts";
import { errorMap } from "./errors.ts";
import { PAYSTACK_SIGNATURE_HEADER, createPaystackPayments } from "./index.ts";

const SECRET = "sk_test_secret";
const fixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8").trim();
const sign = (body: string, secret = SECRET) => ({ headers: { [PAYSTACK_SIGNATURE_HEADER]: hmacSha512Hex(secret, body) }, rawBody: body });

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

/** A fake fetch that answers from fixtures, and remembers what it was asked. */
function fakeFetch(answers: Array<{ status: number; body: string }>) {
  const calls: Call[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const a = answers.shift() ?? { status: 500, body: "{}" };
    const reference = typeof init?.body === "string" ? ((JSON.parse(init.body) as { reference?: string }).reference ?? "") : String(url).split("/").pop() ?? "";
    calls.push({ url: String(url), method: init?.method ?? "GET", headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)), body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
    return new Response(a.body.replaceAll("__REFERENCE__", reference), { status: a.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { f, calls };
}

const input = { accountId: "a1", email: "a@example.com", planId: "pro", money: { amountMinor: 500000, currency: "NGN" }, returnUrl: "https://app.example.com/billing" };

// The contract suite: every checkout is answered from the initialize fixture, and webhooks are signed with the test key.
runPaymentsContract("payments/paystack", () => {
  const { f } = fakeFetch(Array.from({ length: 20 }, () => ({ status: 200, body: fixture("initialize.success.json") })));
  const payments = createPaystackPayments({ secretKey: SECRET, ids: createSequenceIds("r"), fetch: f });
  return {
    payments,
    secrets: [SECRET],
    signedPayment: (reference, outcome) => {
      const base = JSON.parse(fixture(outcome === "success" ? "webhook.charge.success.json" : "webhook.invoice.payment_failed.json")) as { data: { reference: string } };
      base.data.reference = reference;
      return sign(JSON.stringify(base));
    },
    wrongSignature: (reference) => {
      const base = JSON.parse(fixture("webhook.charge.success.json")) as { data: { reference: string } };
      base.data.reference = reference;
      return sign(JSON.stringify(base), "sk_test_other");
    },
    signedGarbage: () => sign("not json"),
    signedUnknown: () => sign(fixture("webhook.transfer.success.json")),
  };
});

test("payments/paystack: initialize sends the documented request, with the secret only in the Authorization header", async () => {
  const { f, calls } = fakeFetch([{ status: 200, body: fixture("initialize.success.json") }]);
  const p = createPaystackPayments({ secretKey: SECRET, ids: createSequenceIds("r"), fetch: f });
  const r = await p.createCheckout(input);
  assert.deepEqual(r, { ok: true, value: { url: "https://checkout.paystack.com/abc123", reference: "ps_r-1" } });
  const [call] = calls;
  assert.equal(call?.url, "https://api.paystack.co/transaction/initialize");
  assert.equal(call?.method, "POST");
  assert.equal(call?.headers.authorization, `Bearer ${SECRET}`);
  assert.deepEqual(call?.body, {
    email: "a@example.com",
    amount: 500000,
    currency: "NGN",
    reference: "ps_r-1",
    callback_url: "https://app.example.com/billing",
    metadata: { accountId: "a1", planId: "pro" },
  });
  assert.equal(JSON.stringify(call?.body).includes(SECRET), false);
});

test("payments/paystack: HTTP and network failures are classified, and none contains the secret", async () => {
  const cases: Array<[string, Array<{ status: number; body: string }>, string, boolean]> = [
    ["401", [{ status: 401, body: fixture("initialize.unauthorized.json") }], "unauthorized", false],
    ["429", [{ status: 429, body: '{"status":false,"message":"slow down"}' }], "rate_limited", true],
    ["500", [{ status: 500, body: '{"status":false,"message":"oops"}' }], "upstream", true],
    ["400", [{ status: 400, body: '{"status":false,"message":"Invalid amount"}' }], "validation", false],
    ["not json", [{ status: 200, body: "<html>" }], "upstream", false],
    ["no url", [{ status: 200, body: '{"status":true,"data":{}}' }], "upstream", false],
  ];
  for (const [label, answers, kind, retryable] of cases) {
    const { f } = fakeFetch(answers);
    const r = await createPaystackPayments({ secretKey: SECRET, ids: createSequenceIds("r"), fetch: f }).createCheckout(input);
    assert.equal(r.ok, false, label);
    if (!r.ok) {
      assert.equal(r.error.kind, kind, label);
      assert.equal(r.error.retryable, retryable, label);
      assert.equal(JSON.stringify(r.error).includes(SECRET), false, label);
    }
  }
  const down = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  const r = await createPaystackPayments({ secretKey: SECRET, ids: createSequenceIds("r"), fetch: down }).createCheckout(input);
  assert.equal(r.ok === false && r.error.kind, "network");
  assert.equal(r.ok === false && r.error.retryable, true);
});

test("payments/paystack: verify maps a successful transaction to active", async () => {
  const { f, calls } = fakeFetch([{ status: 200, body: fixture("verify.success.json") }]);
  const r = await createPaystackPayments({ secretKey: SECRET, ids: createSequenceIds("r"), fetch: f }).getSubscription("ps_r-9");
  assert.deepEqual(r, { ok: true, value: { status: "active" } });
  assert.equal(calls[0]?.url, "https://api.paystack.co/transaction/verify/ps_r-9");
  assert.equal(calls[0]?.method, "GET");
});

test("payments/paystack: cancelling is not supported yet and says so", async () => {
  const r = await createPaystackPayments({ secretKey: SECRET, ids: createSequenceIds("r") }).cancelSubscription("SUB_x");
  assert.equal(r.ok === false && r.error.kind, "forbidden");
});

test("payments/paystack: the signature is the hex HMAC-SHA512 of the raw body (known value)", async () => {
  const body = fixture("webhook.charge.success.json");
  const known = "7f15e2d91bbd3b4a882692927124ebd0600d70da23acd6222157068d431bbc10fac87313f62b54c44d77c1b5c54a725b988281bf1ef72844dcf3f0f31e7a3f64";
  assert.equal(hmacSha512Hex(SECRET, body), known);
  const p = createPaystackPayments({ secretKey: SECRET, ids: createSequenceIds("r") });
  const ok1 = await p.parseWebhook({ headers: { "X-Paystack-Signature": known }, rawBody: body });
  assert.deepEqual(ok1.ok && ok1.value, {
    id: "charge.success:302961",
    type: "payment.succeeded",
    reference: "ps_ref-1",
    accountId: "a1",
    planId: "pro",
    money: { amountMinor: 500000, currency: "NGN" },
  });
  const flipped = await p.parseWebhook({ headers: { "x-paystack-signature": known }, rawBody: body.replace("302961", "302962") });
  assert.equal(flipped.ok === false && flipped.error.kind, "unauthorized");
});

test("payments/paystack: webhook events map to domain events, and incomplete ones are validation errors", async () => {
  const p = createPaystackPayments({ secretKey: SECRET, ids: createSequenceIds("r") });
  const failed = await p.parseWebhook(sign(fixture("webhook.invoice.payment_failed.json")));
  assert.equal(failed.ok && failed.value.type, "payment.failed");
  const cancelled = await p.parseWebhook(sign(fixture("webhook.subscription.disable.json")));
  assert.deepEqual(cancelled.ok && cancelled.value, { id: "subscription.disable:SUB_x1", type: "subscription.cancelled", reference: "SUB_x1", accountId: "a1" });
  const noMeta = await p.parseWebhook(sign('{"event":"charge.success","data":{"id":1,"reference":"r","amount":100,"currency":"NGN"}}'));
  assert.equal(noMeta.ok === false && noMeta.error.kind, "validation");
  const badMoney = await p.parseWebhook(sign('{"event":"charge.success","data":{"id":1,"reference":"r","amount":1.5,"currency":"NGN","metadata":{"accountId":"a","planId":"p"}}}'));
  assert.equal(badMoney.ok === false && badMoney.error.kind, "validation");
});

test("payments/paystack: unmapped failures are unexpected", () => {
  assert.equal(errorMap.map(new Error("x")), "unexpected");
});
