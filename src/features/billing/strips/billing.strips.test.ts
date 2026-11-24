import assert from "node:assert/strict";
import { test } from "node:test";
import { runStrip } from "../../../lib/strip.ts";
import { makeError } from "../../../lib/result.ts";
import type { Ports } from "../../../lib/step.ts";
import type { Principal } from "../../../lib/principal.ts";
import { FAKE_SECRET, FAKE_SIGNATURE_HEADER } from "../../../adapters/payments/fake/index.ts";
import { hmacSha512Hex } from "../../../adapters/payments/signing.ts";
import { DATABASE_KINDS, makeTestPorts } from "../testing.ts";
import type { DatabaseKind } from "../testing.ts";
import { billingFeature } from "../feature.ts";
import { cancel } from "./billing.cancel.strip.ts";
import { checkout } from "./billing.checkout.strip.ts";
import { entitlement } from "./billing.entitlement.strip.ts";
import { plan } from "./billing.plan.strip.ts";
import { webhook } from "./billing.webhook.strip.ts";

function matrix(name: string, body: (database: DatabaseKind) => Promise<void>) {
  for (const database of DATABASE_KINDS) test(`billing strips [db ${database}]: ${name}`, () => body(database));
}

type Env = Awaited<ReturnType<typeof makeTestPorts>>;
const anonymous: Principal = { kind: "anonymous", ip: "10.0.0.1" };
const RETURN = "http://localhost/billing";

async function planOf(env: Env, principal: Principal): Promise<string> {
  const r = await runStrip(plan, env.ports, { principal });
  if (!r.ok) throw new Error(`plan failed: ${r.error.kind}`);
  return r.value.plan.id;
}

/** Starts a checkout for `pro` and returns its reference. */
async function startCheckout(env: Env, principal: Principal, planId = "pro"): Promise<string> {
  const r = await runStrip(checkout, env.ports, { principal, planId, returnUrl: RETURN });
  if (!r.ok) throw new Error(`checkout failed: ${r.error.kind}`);
  return r.value.reference;
}

function sign(body: Record<string, unknown>) {
  const rawBody = JSON.stringify(body);
  return { headers: { [FAKE_SIGNATURE_HEADER]: hmacSha512Hex(FAKE_SECRET, rawBody) }, rawBody };
}

const accountOf = (p: Principal): string => (p.kind === "anonymous" ? "" : p.accountId);

matrix("the seed adds free and pro once, and leaves an edited plan alone", async (database) => {
  const env = await makeTestPorts({ database });
  try {
    await env.ports.database.write("plans").update("pro", { perMonth: 5 });
    assert.equal((await billingFeature.seed?.(env.ports))?.ok, true);
    const all = await env.ports.database.read("plans").list();
    assert.deepEqual(all.ok && all.value.items.map((p) => p.id), ["free", "pro"]);
    const pro = await env.ports.database.read("plans").get("pro");
    assert.equal(pro.ok && pro.value?.perMonth, 5);
  } finally {
    env.cleanup();
  }
});

matrix("an account with no subscription is on the free plan, and the plans on offer come with it", async (database) => {
  const env = await makeTestPorts({ database });
  try {
    const r = await runStrip(plan, env.ports, { principal: env.principals.ada });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual([r.value.plan.id, r.value.subscription], ["free", null]);
    assert.deepEqual(r.value.available.map((p) => p.id), ["free", "pro"]);
    assert.deepEqual(r.value.plan.features, ["basic"]);
  } finally {
    env.cleanup();
  }
});

matrix("plan for an anonymous caller is a toast, and a missing free plan is an internal error", async (database) => {
  const env = await makeTestPorts({ database });
  try {
    const a = await runStrip(plan, env.ports, { principal: anonymous });
    assert.equal(a.ok, false);
    if (!a.ok) assert.equal(a.display.type, "toast");
    await env.ports.database.write("plans").delete("free");
    const r = await runStrip(plan, env.ports, { principal: env.principals.ada });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error.kind, "not_found");
      assert.equal(r.display.type, "generic");
    }
  } finally {
    env.cleanup();
  }
});

matrix("checkout returns the provider's address and changes no plan", async (database) => {
  const env = await makeTestPorts({ database });
  try {
    const r = await runStrip(checkout, env.ports, { principal: env.principals.ada, planId: "pro", returnUrl: RETURN });
    assert.equal(r.ok, true);
    if (r.ok) assert.match(r.value.url, /^\/billing\/fake-checkout\?reference=fake_/);
    assert.equal(await planOf(env, env.principals.ada), "free", "coming back from checkout changes nothing");
  } finally {
    env.cleanup();
  }
});

matrix("checkout problems the user can fix are toasts", async (database) => {
  const env = await makeTestPorts({ database });
  try {
    const cases: [Principal, string, string][] = [
      [env.principals.ada, "free", "That plan is free, so it needs no payment."],
      [env.principals.ada, "gold", "That plan does not exist."],
      [env.principals.ada, "  ", "Choose a plan."],
      [anonymous, "pro", "You need to sign in, or send a valid API key."],
    ];
    for (const [principal, planId, message] of cases) {
      const r = await runStrip(checkout, env.ports, { principal, planId, returnUrl: RETURN });
      assert.equal(r.ok, false, planId);
      if (!r.ok) assert.deepEqual(r.display, { type: "toast", message });
    }
  } finally {
    env.cleanup();
  }
});

matrix("a bad return address is refused, and so is a path that escapes the site", async (database) => {
  const env = await makeTestPorts({ database });
  try {
    for (const returnUrl of ["javascript:alert(1)", "//evil.example/x", "ftp://x", "not a url"]) {
      const r = await runStrip(checkout, env.ports, { principal: env.principals.ada, planId: "pro", returnUrl });
      assert.equal(r.ok, false, returnUrl);
    }
    const ok = await runStrip(checkout, env.ports, { principal: env.principals.ada, planId: "pro", returnUrl: "/billing" });
    assert.equal(ok.ok, true);
  } finally {
    env.cleanup();
  }
});

matrix("a verified payment event raises the plan, and the next plan read shows it", async (database) => {
  const env = await makeTestPorts({ database });
  try {
    const reference = await startCheckout(env, env.principals.ada);
    const signed = env.payments.signedEvent(reference, "success");
    assert.equal(signed.ok, true);
    if (!signed.ok) return;
    const r = await runStrip(webhook, env.ports, signed.value);
    assert.deepEqual(r.ok && r.value, { applied: true, reason: "plan_set" });
    const now = await runStrip(plan, env.ports, { principal: env.principals.ada });
    assert.deepEqual(now.ok && [now.value.plan.id, now.value.plan.perMonth, now.value.subscription?.status], ["pro", 100_000, "active"]);
    assert.equal(await planOf(env, env.principals.grace), "free", "another account is not affected");
    const allows = await runStrip(entitlement, env.ports, { features: now.ok ? now.value.plan.features : [], feature: "advanced" });
    assert.deepEqual(allows.ok && allows.value, { allowed: true });
  } finally {
    env.cleanup();
  }
});

matrix("the same event delivered twice changes state once, even after a later cancellation", async (database) => {
  const env = await makeTestPorts({ database });
  try {
    const reference = await startCheckout(env, env.principals.ada);
    const paid = env.payments.signedEvent(reference, "success");
    if (!paid.ok) throw new Error("no signed event");
    assert.deepEqual((await runStrip(webhook, env.ports, paid.value)).ok && true, true);
    const cancelled = env.payments.signedEvent(reference, "cancelled");
    if (!cancelled.ok) throw new Error("no signed event");
    assert.equal((await runStrip(webhook, env.ports, cancelled.value)).ok, true);
    assert.equal(await planOf(env, env.principals.ada), "free");
    const replay = await runStrip(webhook, env.ports, paid.value);
    assert.deepEqual(replay.ok && replay.value, { applied: false, reason: "duplicate" });
    assert.equal(await planOf(env, env.principals.ada), "free", "a replayed payment does not bring the plan back");
  } finally {
    env.cleanup();
  }
});

matrix("a bad, missing or tampered signature is unauthorized and changes nothing", async (database) => {
  const env = await makeTestPorts({ database });
  try {
    const reference = await startCheckout(env, env.principals.ada);
    const signed = env.payments.signedEvent(reference, "success");
    if (!signed.ok) throw new Error("no signed event");
    const tampered = { headers: signed.value.headers, rawBody: signed.value.rawBody.replace("pro", "free") };
    const cases = [
      { headers: {}, rawBody: signed.value.rawBody },
      { headers: { [FAKE_SIGNATURE_HEADER]: "00" }, rawBody: signed.value.rawBody },
      tampered,
    ];
    for (const c of cases) {
      const r = await runStrip(webhook, env.ports, c);
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.error.kind, "unauthorized");
    }
    assert.equal(await planOf(env, env.principals.ada), "free");
    const events = await env.ports.database.read("payment_events").list();
    assert.equal(events.ok && events.value.items.length, 0, "nothing was stored for a bad signature");
  } finally {
    env.cleanup();
  }
});

matrix("a failed payment leaves the plan unchanged and is stored as handled", async (database) => {
  const env = await makeTestPorts({ database });
  try {
    const reference = await startCheckout(env, env.principals.ada);
    const failed = env.payments.signedEvent(reference, "failed");
    if (!failed.ok) throw new Error("no signed event");
    const r = await runStrip(webhook, env.ports, failed.value);
    assert.deepEqual(r.ok && r.value, { applied: false, reason: "payment_failed" });
    assert.equal(await planOf(env, env.principals.ada), "free");
    const logged = env.logger.entries.some((e) => JSON.stringify(e).includes("payment_failed"));
    assert.equal(logged, true, "the failed payment is logged");
  } finally {
    env.cleanup();
  }
});

matrix("a signed event with the wrong amount, or for an unknown plan, changes nothing", async (database) => {
  const env = await makeTestPorts({ database });
  try {
    const accountId = accountOf(env.principals.ada);
    const base = { type: "payment.succeeded", reference: "r1", accountId };
    const wrongAmount = sign({ ...base, id: "e-amount", planId: "pro", money: { amountMinor: 100, currency: "NGN" } });
    const wrongPlan = sign({ ...base, id: "e-plan", planId: "gold", money: { amountMinor: 500_000, currency: "NGN" } });
    const a = await runStrip(webhook, env.ports, wrongAmount);
    const b = await runStrip(webhook, env.ports, wrongPlan);
    assert.deepEqual(a.ok && a.value, { applied: false, reason: "amount_mismatch" });
    assert.deepEqual(b.ok && b.value, { applied: false, reason: "unknown_plan" });
    assert.equal(await planOf(env, env.principals.ada), "free");
  } finally {
    env.cleanup();
  }
});

matrix("an event of a kind we do not handle is answered as success and changes nothing", async (database) => {
  const env = await makeTestPorts({ database });
  try {
    const r = await runStrip(webhook, env.ports, sign({ id: "e-other", type: "customer.updated" }));
    assert.deepEqual(r.ok && r.value, { applied: false, reason: "ignored" });
    const bad = await runStrip(webhook, env.ports, sign({ nonsense: true }));
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.error.kind, "validation");
  } finally {
    env.cleanup();
  }
});

matrix("an event whose application failed is applied when the provider retries it", async (database) => {
  const env = await makeTestPorts({ database });
  try {
    const reference = await startCheckout(env, env.principals.ada);
    const signed = env.payments.signedEvent(reference, "success");
    if (!signed.ok) throw new Error("no signed event");
    const failing: Ports = { ...env.ports, database: { ...env.ports.database, batch: async () => ({ ok: false as const, error: makeError("unexpected", "adapter:test", "", "boom") }) } };
    const first = await runStrip(webhook, failing, signed.value);
    assert.equal(first.ok, false);
    if (!first.ok) assert.equal(first.error.kind, "unexpected");
    assert.equal(await planOf(env, env.principals.ada), "free");
    const retry = await runStrip(webhook, env.ports, signed.value);
    assert.deepEqual(retry.ok && retry.value, { applied: true, reason: "plan_set" });
    assert.equal(await planOf(env, env.principals.ada), "pro");
  } finally {
    env.cleanup();
  }
});

matrix("cancel returns the account to the free plan, and without a subscription it is a toast", async (database) => {
  const env = await makeTestPorts({ database });
  try {
    const none = await runStrip(cancel, env.ports, { principal: env.principals.ada });
    assert.equal(none.ok, false);
    if (!none.ok) assert.deepEqual(none.display, { type: "toast", message: "You have no active subscription." });
    const reference = await startCheckout(env, env.principals.ada);
    const paid = env.payments.signedEvent(reference, "success");
    if (!paid.ok) throw new Error("no signed event");
    await runStrip(webhook, env.ports, paid.value);
    assert.equal(await planOf(env, env.principals.ada), "pro");
    const r = await runStrip(cancel, env.ports, { principal: env.principals.ada });
    assert.deepEqual(r.ok && r.value, { accountId: accountOf(env.principals.ada), status: "cancelled" });
    assert.equal(await planOf(env, env.principals.ada), "free");
    const anon = await runStrip(cancel, env.ports, { principal: anonymous });
    assert.equal(anon.ok, false);
  } finally {
    env.cleanup();
  }
});

matrix("when the provider cannot cancel, the subscription stays active", async (database) => {
  const env = await makeTestPorts({ database });
  try {
    const reference = await startCheckout(env, env.principals.ada);
    const paid = env.payments.signedEvent(reference, "success");
    if (!paid.ok) throw new Error("no signed event");
    await runStrip(webhook, env.ports, paid.value);
    const refusing: Ports = {
      ...env.ports,
      payments: { ...env.ports.payments, cancelSubscription: async () => ({ ok: false as const, error: makeError("forbidden", "adapter:test", "", "cancel is not supported") }) },
    };
    const r = await runStrip(cancel, refusing, { principal: env.principals.ada });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.display.type, "generic");
    assert.equal(await planOf(env, env.principals.ada), "pro");
  } finally {
    env.cleanup();
  }
});

matrix("an unreachable provider makes checkout an internal error", async (database) => {
  const env = await makeTestPorts({ database });
  try {
    const down: Ports = {
      ...env.ports,
      payments: { ...env.ports.payments, createCheckout: async () => ({ ok: false as const, error: makeError("upstream", "adapter:test", "", "502 from provider") }) },
    };
    const r = await runStrip(checkout, down, { principal: env.principals.ada, planId: "pro", returnUrl: RETURN });
    assert.equal(r.ok, false);
    if (!r.ok) assert.deepEqual(r.display, { type: "generic", reference: r.stripId });
  } finally {
    env.cleanup();
  }
});

matrix("the webhook's signature and raw body never reach the logger, the reporter or the metrics", async (database) => {
  const env = await makeTestPorts({ database });
  try {
    const reference = await startCheckout(env, env.principals.ada);
    const signed = env.payments.signedEvent(reference, "success");
    if (!signed.ok) throw new Error("no signed event");
    await runStrip(webhook, env.ports, signed.value);
    await runStrip(webhook, env.ports, { headers: { [FAKE_SIGNATURE_HEADER]: "deadbeef-signature" }, rawBody: signed.value.rawBody });
    const everything = JSON.stringify([env.logger.entries, env.reporter.reports, env.metrics.points]);
    assert.ok(everything.length > 100);
    const signature = signed.value.headers[FAKE_SIGNATURE_HEADER] ?? "";
    assert.ok(signature.length > 20);
    assert.equal(everything.includes(signature), false, "the signature is in a log, report or metric");
    assert.equal(everything.includes("deadbeef-signature"), false);
    // The parsed event (ids and amounts) may be logged by the later steps, which helps debugging. The raw text may not.
    assert.equal(everything.includes(JSON.stringify(signed.value.rawBody).slice(1, -1)), false, "the raw body is in a log, report or metric");
  } finally {
    env.cleanup();
  }
});

test("billing strips: only the webhook is sensitive", () => {
  assert.deepEqual(
    [checkout, webhook, plan, entitlement, cancel].map((s) => [s.name, s.sensitive]),
    [["billing.checkout", false], ["billing.webhook", true], ["billing.plan", false], ["billing.entitlement", false], ["billing.cancel", false]],
  );
});
