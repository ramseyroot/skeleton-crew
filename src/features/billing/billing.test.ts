import assert from "node:assert/strict";
import { test } from "node:test";
import { runStrip } from "../../lib/strip.ts";
import { DATABASE_KINDS, makeTestPorts } from "./testing.ts";
import { completeFakeCheckout, hasFakeCheckout, runBillingIntent } from "./billing.ts";
import { plan } from "./strips/billing.plan.strip.ts";

const form = (fields: Record<string, string>): FormData => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

for (const database of DATABASE_KINDS) {
  test(`billing page flow [db ${database}]: upgrade at the test checkout, then cancel`, async () => {
    const env = await makeTestPorts({ database });
    try {
      assert.equal(hasFakeCheckout(env.ports), true);
      const started = await runBillingIntent(env.ports, env.principals.ada, form({ intent: "checkout", planId: "pro" }), "/billing");
      assert.equal(started.ok, true);
      if (!started.ok || started.value.kind !== "checkout") throw new Error("expected checkout");
      const reference = new URL(started.value.url, "http://x").searchParams.get("reference") ?? "";
      const paid = await completeFakeCheckout(env.ports, reference, "success");
      assert.deepEqual(paid.ok && paid.value, { applied: true, reason: "plan_set" });
      const now = await runStrip(plan, env.ports, { principal: env.principals.ada });
      assert.equal(now.ok && now.value.plan.id, "pro");
      const cancelled = await runBillingIntent(env.ports, env.principals.ada, form({ intent: "cancel" }), "/billing");
      assert.deepEqual(cancelled.ok && cancelled.value, { kind: "cancelled" });
    } finally {
      env.cleanup();
    }
  });

  test(`billing page flow [db ${database}]: failures are public results, and an unknown checkout or intent is handled`, async () => {
    const env = await makeTestPorts({ database });
    try {
      const bad = await runBillingIntent(env.ports, env.principals.ada, form({ intent: "checkout", planId: "gold" }), "/billing");
      assert.equal(bad.ok, false);
      if (!bad.ok) {
        assert.deepEqual(bad.display, { type: "toast", message: "That plan does not exist." });
        assert.equal("error" in bad, false);
      }
      const unknown = await completeFakeCheckout(env.ports, "fake_nope", "success");
      assert.equal(unknown.ok, false);
      if (!unknown.ok) assert.equal(unknown.display.type, "toast");
      const intent = await runBillingIntent(env.ports, env.principals.ada, form({ intent: "x" }), "/billing");
      assert.equal(intent.ok, false);
    } finally {
      env.cleanup();
    }
  });
}

test("completeFakeCheckout: pressing Pay twice changes the plan once", async () => {
  const env = await makeTestPorts();
  try {
    const started = await runBillingIntent(env.ports, env.principals.ada, form({ intent: "checkout", planId: "pro" }), "/billing");
    if (!started.ok || started.value.kind !== "checkout") throw new Error("expected checkout");
    const reference = new URL(started.value.url, "http://x").searchParams.get("reference") ?? "";
    const first = await completeFakeCheckout(env.ports, reference, "success");
    const second = await completeFakeCheckout(env.ports, reference, "success");
    assert.deepEqual(first.ok && first.value.reason, "plan_set");
    assert.deepEqual(second.ok && second.value.reason, "duplicate");
  } finally {
    env.cleanup();
  }
});

test("hasFakeCheckout: false for a provider without a test checkout", async () => {
  const env = await makeTestPorts();
  try {
    const { signedEvent: _unused, ...plain } = env.payments;
    assert.equal(hasFakeCheckout({ ...env.ports, payments: plain }), false);
    const refused = await completeFakeCheckout({ ...env.ports, payments: plain }, "x", "success");
    assert.equal(refused.ok, false);
  } finally {
    env.cleanup();
  }
});
