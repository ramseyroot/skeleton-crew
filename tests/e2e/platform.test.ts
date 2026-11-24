// End to end through Request and Response: the four platform features composed by src/app/api.ts, on both
// databases, with the network blocked. These are the cases of design section 8.

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApiDeps } from "../../src/app/api.ts";
import { accountsFeature, meEndpoint } from "../../src/features/accounts/index.ts";
import { apiKeysFeature, createApiKey, revokeApiKey } from "../../src/features/api-keys/index.ts";
import { billingFeature, handleWebhook } from "../../src/features/billing/index.ts";
import { usageFeature, month } from "../../src/features/usage/index.ts";
import { createApiHandler } from "../../src/lib/http.ts";
import type { FeatureModule } from "../../src/lib/feature.ts";
import type { Principal } from "../../src/lib/principal.ts";
import { runStrip } from "../../src/lib/strip.ts";
import { makeTestPorts, DATABASE_KINDS } from "../../src/test-utils/ports.ts";
import type { DatabaseKind } from "../../src/test-utils/ports.ts";
import { FAKE_SECRET, FAKE_SIGNATURE_HEADER } from "../../src/adapters/payments/fake/index.ts";
import { hmacSha512Hex } from "../../src/adapters/payments/signing.ts";
import { SESSION_COOKIE } from "../../src/shared/session.ts";

const ALL: readonly FeatureModule[] = [accountsFeature, apiKeysFeature, billingFeature, usageFeature];

async function setup(database: DatabaseKind, list: readonly FeatureModule[] = ALL) {
  const env = await makeTestPorts({ database, features: list });
  const handle = createApiHandler(buildApiDeps(list, async () => env.ports));
  const login = await env.ports.auth.verifyPassword("demo@example.com", "demo-password-123");
  if (!login.ok) throw new Error("the demo account is missing");
  const principal: Principal = { kind: "user", accountId: login.value.id, role: login.value.role };
  const call = (headers: Record<string, string> = {}) => handle(new Request("http://localhost/api/v1/me", { headers }), meEndpoint);
  const newKey = async (name = "e2e") => {
    const r = await runStrip(createApiKey, env.ports, { principal, name, expiresInDays: null });
    if (!r.ok) throw new Error(`key creation failed: ${r.error.kind}`);
    return r.value;
  };
  const used = async () => {
    const r = await runStrip(month, env.ports, { principal });
    if (!r.ok) throw new Error("usage failed");
    return r.value.total;
  };
  return { ...env, handle, principal, accountId: login.value.id, call, newKey, used };
}

const bearer = (key: string) => ({ authorization: `Bearer ${key}` });

function matrix(name: string, body: (database: DatabaseKind) => Promise<void>) {
  for (const database of DATABASE_KINDS) test(`e2e [db ${database}]: ${name}`, () => body(database));
}

function signedWebhook(body: Record<string, unknown>): Request {
  const rawBody = JSON.stringify(body);
  return new Request("http://localhost/api/webhooks/payments", {
    method: "POST",
    headers: { [FAKE_SIGNATURE_HEADER]: hmacSha512Hex(FAKE_SECRET, rawBody) },
    body: rawBody,
  });
}

async function upgrade(env: Awaited<ReturnType<typeof setup>>): Promise<Request> {
  const checkout = await env.ports.payments.createCheckout({
    accountId: env.accountId,
    email: "demo@example.com",
    planId: "pro",
    money: { amountMinor: 500_000, currency: "NGN" },
    returnUrl: "/billing",
  });
  if (!checkout.ok) throw new Error("checkout failed");
  const signed = env.payments.signedEvent(checkout.value.reference, "success");
  if (!signed.ok) throw new Error("no signed event");
  return new Request("http://localhost/api/webhooks/payments", { method: "POST", headers: signed.value.headers, body: signed.value.rawBody });
}

matrix("a key request succeeds, is metered, and carries limit headers and the strip reference", async (database) => {
  const env = await setup(database);
  try {
    const key = await env.newKey();
    const res = await env.call(bearer(key.key));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { data: { id: string; email: string } };
    assert.deepEqual([body.data.id, body.data.email], [env.accountId, "demo@example.com"]);
    assert.match(res.headers.get("x-request-id") ?? "", /^strip-/);
    assert.equal(res.headers.get("ratelimit-limit"), "60");
    assert.equal(res.headers.get("ratelimit-remaining"), "59");
    assert.equal(await env.used(), 1);
    await env.call(bearer(key.key));
    assert.equal(await env.used(), 2);
  } finally {
    env.cleanup();
  }
});

matrix("a session cookie works too, and X-API-Key is accepted", async (database) => {
  const env = await setup(database);
  try {
    const session = await env.ports.auth.createSession(env.accountId);
    if (!session.ok) throw new Error("no session");
    const viaCookie = await env.call({ cookie: `theme=dark; ${SESSION_COOKIE}=${session.value.token}` });
    assert.equal(viaCookie.status, 200);
    const key = await env.newKey();
    const viaHeader = await env.call({ "x-api-key": key.key });
    assert.equal(viaHeader.status, 200);
  } finally {
    env.cleanup();
  }
});

matrix("no credentials, a bad key, a revoked key and a bad session are all 401 with one message", async (database) => {
  const env = await setup(database);
  try {
    const revoked = await env.newKey("old");
    await runStrip(revokeApiKey, env.ports, { principal: env.principal, keyId: revoked.id });
    const attempts: Record<string, string>[] = [
      {},
      bearer("sk_bad"),
      bearer(`sk_${"a".repeat(8)}_${"b".repeat(48)}`),
      bearer(revoked.key),
      { cookie: `${SESSION_COOKIE}=not-a-session` },
    ];
    for (const headers of attempts) {
      const res = await env.call(headers);
      assert.equal(res.status, 401, JSON.stringify(headers));
      const body = (await res.json()) as { error: { code: string; message: string; request_id: string } };
      assert.equal(body.error.code, "unauthorized");
      assert.ok(body.error.request_id.length > 0);
    }
    assert.equal(await env.used(), 0, "unauthenticated requests have no account to count");
  } finally {
    env.cleanup();
  }
});

matrix("the 61st request in a minute is a 429 with Retry-After and the limit headers", async (database) => {
  const env = await setup(database);
  try {
    const key = await env.newKey();
    for (let i = 1; i <= 60; i += 1) assert.equal((await env.call(bearer(key.key))).status, 200, `request ${i}`);
    const res = await env.call(bearer(key.key));
    assert.equal(res.status, 429);
    assert.equal(res.headers.get("ratelimit-limit"), "60");
    assert.equal(res.headers.get("ratelimit-remaining"), "0");
    assert.ok(Number(res.headers.get("retry-after")) >= 1);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "rate_limited");
    env.clock.advance(60_000);
    assert.equal((await env.call(bearer(key.key))).status, 200, "the next window starts fresh");
  } finally {
    env.cleanup();
  }
});

matrix("the monthly quota stops a key, and a verified upgrade raises the limit for the next request", async (database) => {
  const env = await setup(database);
  try {
    await env.ports.database.write("plans").update("free", { perMonth: 3 });
    const key = await env.newKey();
    for (let i = 1; i <= 3; i += 1) assert.equal((await env.call(bearer(key.key))).status, 200);
    const stopped = await env.call(bearer(key.key));
    assert.equal(stopped.status, 429);
    assert.ok(Number(stopped.headers.get("retry-after")) > 60, "the retry time points at next month");
    assert.match(((await stopped.json()) as { error: { message: string } }).error.message, /quota/);

    const hook = await upgrade(env);
    assert.equal((await handleWebhook(hook, env.ports)).status, 200);
    assert.equal((await env.call(bearer(key.key))).status, 200, "pro allows 100000 a month");
  } finally {
    env.cleanup();
  }
});

matrix("a replayed webhook changes nothing, and a bad signature is a 401", async (database) => {
  const env = await setup(database);
  try {
    const key = await env.newKey();
    const hook = await upgrade(env);
    const copy = hook.clone();
    assert.equal((await handleWebhook(hook, env.ports)).status, 200);
    const replay = await handleWebhook(copy, env.ports);
    assert.equal(replay.status, 200, "a duplicate is answered with success so the provider stops retrying");
    const plan = await env.call(bearer(key.key));
    assert.equal(plan.headers.get("ratelimit-limit"), "600");

    const bad = new Request("http://localhost/api/webhooks/payments", { method: "POST", headers: { [FAKE_SIGNATURE_HEADER]: "00" }, body: "{}" });
    const refused = await handleWebhook(bad, env.ports);
    assert.equal(refused.status, 401);
    const shape = await handleWebhook(signedWebhook({ nonsense: true }), env.ports);
    assert.equal(shape.status, 400);
    const ignored = await handleWebhook(signedWebhook({ id: "e1", type: "customer.updated" }), env.ports);
    assert.equal(ignored.status, 200);
    const noSignature = await handleWebhook(new Request("http://localhost/x", { method: "POST", body: "{}" }), env.ports);
    assert.equal(noSignature.status, 401);
  } finally {
    env.cleanup();
  }
});

matrix("an internal failure shows only a generic message and a reference, never the cause", async (database) => {
  const env = await setup(database);
  try {
    const key = await env.newKey();
    const secretText = "connection string postgres://user:hunter2@db";
    const broken = {
      ...env.ports,
      auth: {
        ...env.ports.auth,
        // The first lookup is the key check and must work. The second is the `me` strip, which fails.
        getAccount: (() => {
          let calls = 0;
          return async (id: string) => {
            calls += 1;
            if (calls === 1) return env.ports.auth.getAccount(id);
            throw new Error(secretText);
          };
        })(),
      },
    };
    const failing = createApiHandler(buildApiDeps(ALL, async () => broken));
    const res = await failing(new Request("http://localhost/api/v1/me", { headers: bearer(key.key) }), meEndpoint);
    assert.equal(res.status, 500);
    assert.match(res.headers.get("x-request-id") ?? "", /^strip-/, "the reference is the strip's id");
    const text = await res.text();
    assert.match(text, /"code":"unexpected"/);
    assert.equal(text.includes("hunter2"), false);
    assert.equal(text.includes(secretText), false);
  } finally {
    env.cleanup();
  }
});

matrix("a failure while counting never changes the answer", async (database) => {
  const env = await setup(database);
  try {
    const key = await env.newKey();
    const noCounting: FeatureModule = {
      ...usageFeature,
      api: { ...usageFeature.api, record: async () => { throw new Error("counter store is down"); } },
    };
    const handle = createApiHandler(buildApiDeps([accountsFeature, apiKeysFeature, billingFeature, noCounting], async () => env.ports));
    const res = await handle(new Request("http://localhost/api/v1/me", { headers: bearer(key.key) }), meEndpoint);
    assert.equal(res.status, 200);
  } finally {
    env.cleanup();
  }
});

test("e2e: with every feature switched off the pipeline still answers, and nobody can sign in", async () => {
  const env = await makeTestPorts({ features: [] });
  const handle = createApiHandler(buildApiDeps([], async () => env.ports));
  try {
    const attempts: Record<string, string>[] = [{}, bearer("sk_whatever"), { cookie: `${SESSION_COOKIE}=x` }];
    for (const headers of attempts) {
      const res = await handle(new Request("http://localhost/api/v1/me", { headers }), meEndpoint);
      assert.equal(res.status, 401);
    }
  } finally {
    env.cleanup();
  }
});

test("e2e: without billing and usage the defaults apply: 60 a minute, no monthly cap, nothing counted", async () => {
  const list = [accountsFeature, apiKeysFeature];
  const env = await makeTestPorts({ features: list });
  try {
    const handle = createApiHandler(buildApiDeps(list, async () => env.ports));
    const login = await env.ports.auth.verifyPassword("demo@example.com", "demo-password-123");
    if (!login.ok) throw new Error("no demo account");
    const made = await runStrip(createApiKey, env.ports, { principal: { kind: "user", accountId: login.value.id, role: "user" }, name: "k", expiresInDays: null });
    if (!made.ok) throw new Error("no key");
    const res = await handle(new Request("http://localhost/api/v1/me", { headers: bearer(made.value.key) }), meEndpoint);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("ratelimit-limit"), "60");
  } finally {
    env.cleanup();
  }
});

test("e2e: the pipeline refuses an endpoint whose feature the plan does not include", async () => {
  const env = await setup("memory");
  try {
    const key = await env.newKey();
    const endpoint = { ...meEndpoint, name: "me.advanced", feature: "advanced" };
    const res = await env.handle(new Request("http://localhost/x", { headers: bearer(key.key) }), endpoint);
    assert.equal(res.status, 403);
    assert.equal((await handleWebhook(await upgrade(env), env.ports)).status, 200);
    const allowed = await env.handle(new Request("http://localhost/x", { headers: bearer(key.key) }), endpoint);
    assert.equal(allowed.status, 200, "pro includes the advanced feature");
  } finally {
    env.cleanup();
  }
});
