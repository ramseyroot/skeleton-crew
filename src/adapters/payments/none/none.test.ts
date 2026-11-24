import assert from "node:assert/strict";
import { test } from "node:test";
import { runPaymentsContract } from "../contract.test.ts";
import { errorMap } from "./errors.ts";
import { createNonePayments } from "./index.ts";

const unusedHarness = () => {
  const refuse = () => ({ headers: {}, rawBody: "{}" });
  return { payments: createNonePayments(), signedPayment: refuse, wrongSignature: refuse, signedGarbage: refuse, signedUnknown: refuse, secrets: [] };
};

runPaymentsContract("payments/none", unusedHarness, { refuses: true });

test("payments/none: the error says payments are not configured", async () => {
  const r = await createNonePayments().createCheckout({ accountId: "a", email: "a@b.c", planId: "p", money: { amountMinor: 1, currency: "NGN" }, returnUrl: "http://x" });
  assert.equal(r.ok === false && /payments are not configured/.test(r.error.message), true);
});

test("payments/none: unmapped failures are unexpected", () => {
  assert.equal(errorMap.map(new Error("x")), "unexpected");
});
