import assert from "node:assert/strict";
import { test } from "node:test";
import { createFixedClock } from "../../clock/fixed/index.ts";
import { createSequenceIds } from "../../ids/sequence/index.ts";
import { runPaymentsContract } from "../contract.test.ts";
import { hmacSha512Hex } from "../signing.ts";
import { FAKE_SECRET, FAKE_SIGNATURE_HEADER, createFakePayments } from "./index.ts";
import { errorMap } from "./errors.ts";

const make = () => createFakePayments({ clock: createFixedClock(), ids: createSequenceIds("c") });

runPaymentsContract("payments/fake", () => {
  const payments = make();
  const sign = (body: string, secret = FAKE_SECRET) => ({ headers: { [FAKE_SIGNATURE_HEADER]: hmacSha512Hex(secret, body) }, rawBody: body });
  return {
    payments,
    secrets: [FAKE_SECRET],
    signedPayment: (reference, outcome) => {
      const r = payments.signedEvent(reference, outcome);
      if (!r.ok) throw new Error("no such checkout");
      return r.value;
    },
    wrongSignature: (reference) => {
      const r = payments.signedEvent(reference, "success");
      if (!r.ok) throw new Error("no such checkout");
      return sign(r.value.rawBody, "another-secret");
    },
    signedGarbage: () => sign("not json at all"),
    signedUnknown: () => sign(JSON.stringify({ id: "evt_x", type: "customer.created" })),
  };
});

test("payments/fake: the checkout url points at the local fake checkout page", async () => {
  const r = await make().createCheckout({ accountId: "a1", email: "a@b.c", planId: "pro", money: { amountMinor: 100, currency: "NGN" }, returnUrl: "http://localhost:3000/billing" });
  assert.equal(r.ok && r.value.url, "/billing/fake-checkout?reference=fake_c-1");
});

test("payments/fake: paying marks the checkout active, and cancelling marks it cancelled", async () => {
  const p = make();
  const c = await p.createCheckout({ accountId: "a1", email: "a@b.c", planId: "pro", money: { amountMinor: 100, currency: "NGN" }, returnUrl: "http://localhost/x" });
  if (!c.ok) return assert.fail("checkout failed");
  assert.deepEqual(await p.getSubscription(c.value.reference), { ok: true, value: { status: "unknown" } });
  p.signedEvent(c.value.reference, "success");
  assert.deepEqual(await p.getSubscription(c.value.reference), { ok: true, value: { status: "active" } });
  assert.equal((await p.cancelSubscription(c.value.reference)).ok, true);
  assert.deepEqual(await p.getSubscription(c.value.reference), { ok: true, value: { status: "cancelled" } });
  const missing = await p.cancelSubscription("fake_nope");
  assert.equal(missing.ok === false && missing.error.kind, "not_found");
});

test("payments/fake: a cancel event carries the account", async () => {
  const p = make();
  const c = await p.createCheckout({ accountId: "a1", email: "a@b.c", planId: "pro", money: { amountMinor: 100, currency: "NGN" }, returnUrl: "http://localhost/x" });
  if (!c.ok) return assert.fail("checkout failed");
  const e = p.signedEvent(c.value.reference, "cancelled");
  if (!e.ok) return assert.fail("no event");
  const parsed = await p.parseWebhook(e.value);
  assert.deepEqual(parsed.ok && parsed.value, { id: `evt_${c.value.reference}_cancelled`, type: "subscription.cancelled", reference: c.value.reference, accountId: "a1" });
});

test("payments/fake: unmapped failures are unexpected", () => {
  assert.equal(errorMap.map(new Error("x")), "unexpected");
});
