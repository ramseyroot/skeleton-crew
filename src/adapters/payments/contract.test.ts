// Contract suite for the Payments port. Each adapter's test supplies a harness that can produce a correctly signed
// webhook for a payment, because signing differs per provider.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Payments } from "../../ports/payments.ts";

export type PaymentsHarness = {
  payments: Payments;
  /** A correctly signed webhook for a checkout the adapter created. */
  signedPayment(reference: string, outcome: "success" | "failed"): { headers: Record<string, string>; rawBody: string };
  /** The same body signed with a different secret. */
  wrongSignature(reference: string): { headers: Record<string, string>; rawBody: string };
  /** A signed body that is not JSON. */
  signedGarbage(): { headers: Record<string, string>; rawBody: string };
  /** A signed event of a type the adapter does not handle. */
  signedUnknown(): { headers: Record<string, string>; rawBody: string };
  secrets: string[];
};
export type MakePayments = () => PaymentsHarness;

const checkout = { accountId: "a1", email: "a@example.com", planId: "pro", money: { amountMinor: 500000, currency: "NGN" }, returnUrl: "https://app.example.com/billing" };

/**
 * `refuses: true` is for the `none` adapter: it never works, so the suite checks instead that every call is
 * `forbidden` and no capability is claimed.
 */
export function runPaymentsContract(name: string, make: MakePayments, options: { refuses?: boolean } = {}): void {
  if (options.refuses) {
    test(`${name}: every call is forbidden and no capability is claimed`, async () => {
      const { payments } = make();
      assert.deepEqual(payments.capabilities, { refund: false, payout: false, split: false, cancel: false });
      const results = [
        await payments.createCheckout(checkout),
        await payments.getSubscription("r"),
        await payments.cancelSubscription("r"),
        await payments.parseWebhook({ headers: {}, rawBody: "{}" }),
      ];
      for (const r of results) {
        assert.equal(r.ok, false);
        if (!r.ok) assert.equal(r.error.kind, "forbidden");
      }
    });
    return;
  }
  test(`${name}: capabilities are flags, and the name is set`, () => {
    const { payments } = make();
    assert.equal(typeof payments.name, "string");
    for (const flag of ["refund", "payout", "split", "cancel"] as const) assert.equal(typeof payments.capabilities[flag], "boolean");
  });

  test(`${name}: a checkout gives a url and a reference`, async () => {
    const { payments } = make();
    const r = await payments.createCheckout(checkout);
    assert.equal(r.ok, true, JSON.stringify(r));
    if (r.ok) {
      assert.match(r.value.url, /^(https?:\/\/|\/)/);
      assert.ok(r.value.reference.length > 3);
    }
  });

  test(`${name}: money must be whole minor units and a three-letter code`, async () => {
    const { payments } = make();
    for (const money of [{ amountMinor: 10.5, currency: "NGN" }, { amountMinor: 0, currency: "NGN" }, { amountMinor: -5, currency: "NGN" }, { amountMinor: 100, currency: "ngn" }, { amountMinor: 100, currency: "NAIRA" }]) {
      const r = await payments.createCheckout({ ...checkout, money });
      assert.equal(r.ok, false, JSON.stringify(money));
      if (!r.ok) assert.equal(r.error.kind, "validation");
    }
  });

  test(`${name}: a verified payment webhook becomes a domain event with the account, plan and money`, async () => {
    const h = make();
    const c = await h.payments.createCheckout(checkout);
    assert.equal(c.ok, true);
    if (!c.ok) return;
    const signed = h.signedPayment(c.value.reference, "success");
    const parsed = await h.payments.parseWebhook(signed);
    assert.equal(parsed.ok, true, JSON.stringify(parsed));
    if (parsed.ok && parsed.value.type === "payment.succeeded") {
      assert.equal(parsed.value.accountId, "a1");
      assert.equal(parsed.value.planId, "pro");
      assert.deepEqual(parsed.value.money, { amountMinor: 500000, currency: "NGN" });
      assert.equal(parsed.value.reference, c.value.reference);
    } else {
      assert.fail(`unexpected event ${JSON.stringify(parsed)}`);
    }
    const failed = await h.payments.parseWebhook(h.signedPayment(c.value.reference, "failed"));
    assert.equal(failed.ok && failed.value.type, "payment.failed");
  });

  test(`${name}: the same event delivered twice has the same id`, async () => {
    const h = make();
    const c = await h.payments.createCheckout(checkout);
    if (!c.ok) return assert.fail("checkout failed");
    const signed = h.signedPayment(c.value.reference, "success");
    const a = await h.payments.parseWebhook(signed);
    const b = await h.payments.parseWebhook({ headers: { ...signed.headers }, rawBody: signed.rawBody });
    assert.equal(a.ok && b.ok && a.value.id === b.value.id, true);
  });

  test(`${name}: a missing, wrong or tampered signature is unauthorized`, async () => {
    const h = make();
    const c = await h.payments.createCheckout(checkout);
    if (!c.ok) return assert.fail("checkout failed");
    const signed = h.signedPayment(c.value.reference, "success");
    const cases = [
      { headers: {}, rawBody: signed.rawBody },
      h.wrongSignature(c.value.reference),
      { headers: signed.headers, rawBody: signed.rawBody.replace("500000", "1") },
      { headers: Object.fromEntries(Object.keys(signed.headers).map((k) => [k, "00"])), rawBody: signed.rawBody },
    ];
    for (const c2 of cases) {
      const r = await h.payments.parseWebhook(c2);
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.error.kind, "unauthorized");
    }
  });

  test(`${name}: header names are matched without regard to case`, async () => {
    const h = make();
    const c = await h.payments.createCheckout(checkout);
    if (!c.ok) return assert.fail("checkout failed");
    const signed = h.signedPayment(c.value.reference, "success");
    const upper = Object.fromEntries(Object.entries(signed.headers).map(([k, v]) => [k.toUpperCase(), v]));
    assert.equal((await h.payments.parseWebhook({ headers: upper, rawBody: signed.rawBody })).ok, true);
  });

  test(`${name}: a signed body that is not JSON is a validation error, and an unknown event is ignored`, async () => {
    const h = make();
    const garbage = await h.payments.parseWebhook(h.signedGarbage());
    assert.equal(garbage.ok === false && garbage.error.kind, "validation");
    const unknown = await h.payments.parseWebhook(h.signedUnknown());
    assert.equal(unknown.ok && unknown.value.type, "ignored");
  });

  test(`${name}: no secret appears in an error`, async () => {
    const h = make();
    const r = await h.payments.parseWebhook({ headers: {}, rawBody: "{}" });
    const text = JSON.stringify(r);
    for (const secret of h.secrets) assert.equal(text.includes(secret), false);
  });
}
