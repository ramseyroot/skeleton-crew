import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { createApiHandler, errorBody, publicMessage, rateLimitHeaders, statusOf } from "../../src/lib/http.ts";
import type { Allowance, ApiDeps, Endpoint, Rule } from "../../src/lib/http.ts";
import type { Principal } from "../../src/lib/principal.ts";
import { err, makeError, ok } from "../../src/lib/result.ts";
import type { Result } from "../../src/lib/result.ts";
import { defineStep } from "../../src/lib/step.ts";
import { defineStrip } from "../../src/lib/strip.ts";
import { makeTestPorts } from "../../src/test-utils/ports.ts";

const NONE = { reads: [], writes: [], storage: [] } as const;
const In = z.object({ who: z.string() });

const hello = defineStep({
  name: "pure.hello.greet",
  class: "pure",
  input: In,
  output: z.object({ greeting: z.string() }),
  permissions: NONE,
  errors: [],
  run: (i) => ({ greeting: `hello ${i.who}` }),
});
const helloStrip = defineStrip({ name: "hello.greet", budget: NONE, steps: [hello], invalidates: [], routing: { "*": "abort" } });

const boom = defineStep({
  name: "pure.hello.boom",
  class: "pure",
  input: In,
  output: z.object({ greeting: z.string() }),
  permissions: NONE,
  errors: [],
  run: () => {
    throw new Error("secret database detail");
  },
});
const boomStrip = defineStrip({ name: "hello.boom", budget: NONE, steps: [boom], invalidates: [], routing: { "*": "abort" } });

const nope = defineStep({
  name: "pure.hello.nope",
  class: "pure",
  input: In,
  output: z.object({ greeting: z.string() }),
  permissions: NONE,
  errors: ["conflict"],
  run: (_i, ctx) => err(makeError("conflict", "pure.hello.nope", ctx.stripId, "internal text", { audience: "user", userMessage: "That name is taken." })),
});
const nopeStrip = defineStrip({ name: "hello.nope", budget: NONE, steps: [nope], invalidates: [], routing: { "*": "abort" } });

const key: Principal = { kind: "key", accountId: "a1", keyId: "k1", role: "user" };

function harness(overrides: Partial<ApiDeps> = {}, limits = { perMinute: 2, perMonth: 5, features: ["hello"] }) {
  const recorded: { endpoint: string; status: number; principal: Principal }[] = [];
  const counters = new Map<string, number>();
  const modes: string[] = [];
  let ports: Awaited<ReturnType<typeof makeTestPorts>> | null = null;
  const deps: ApiDeps = {
    ports: async () => {
      ports ??= await makeTestPorts({ env: "local" });
      return ports.ports;
    },
    authenticate: async (req, _p, mode) => {
      modes.push(mode);
      return req.headers.get("authorization") === "Bearer good" ? ok(key) : err(makeError("unauthorized", "api.test", "", "bad key"));
    },
    limitsFor: async () => ok(limits),
    usedThisMonth: async () => ok(used.n),
    record: async (e) => {
      recorded.push(e);
      return ok(undefined);
    },
    checkLimit: async (k: string, rule: Rule, p) => {
      const n = (counters.get(k) ?? 0) + 1;
      counters.set(k, n);
      const a: Allowance = { allowed: n <= rule.limit, limit: rule.limit, remaining: rule.limit - n, resetAt: new Date(Date.parse(p.clock.now()) + 30_000).toISOString(), retryAfterSeconds: 30 };
      return ok(a);
    },
    ...overrides,
  };
  const used = { n: 0 };
  return { handle: createApiHandler(deps), recorded, used, modes, counters, get ports() { return ports!.ports; }, get reporter() { return ports!.reporter; }, get logger() { return ports!.logger; } };
}

const endpoint = (extra: Partial<Endpoint<{ who: string }, { greeting: string }>> = {}): Endpoint<{ who: string }, { greeting: string }> => ({
  name: "hello.get",
  auth: "key",
  input: () => ({ who: "world" }),
  strip: helloStrip,
  ...extra,
});

const authed = (): Request => new Request("http://x/api", { headers: { authorization: "Bearer good" } });

test("one table maps every error kind to a status, and error bodies have one shape", () => {
  assert.deepEqual(
    (["validation", "unauthorized", "forbidden", "not_found", "conflict", "rate_limited", "upstream", "network", "unexpected"] as const).map(statusOf),
    [400, 401, 403, 404, 409, 429, 502, 503, 500],
  );
  assert.deepEqual(errorBody("conflict", "m", "r1"), { error: { code: "conflict", message: "m", request_id: "r1" } });
});

test("a user error shows its written message, an internal error a fixed sentence", () => {
  assert.equal(publicMessage(makeError("conflict", "a.b.c", "s", "secret", { audience: "user", userMessage: "Taken." })), "Taken.");
  assert.equal(publicMessage(makeError("unexpected", "a.b.c", "s", "secret db text")), "Something went wrong on our side.");
});

test("rate limit headers carry the limit, the remaining, seconds to reset, and Retry-After only when blocked", () => {
  const now = "2026-11-23T12:00:00.000Z";
  const open = rateLimitHeaders({ allowed: true, limit: 60, remaining: 59, resetAt: "2026-11-23T12:00:30.000Z", retryAfterSeconds: 0 }, now);
  assert.deepEqual(open, { "ratelimit-limit": "60", "ratelimit-remaining": "59", "ratelimit-reset": "30" });
  const blocked = rateLimitHeaders({ allowed: false, limit: 60, remaining: -3, resetAt: "2026-11-23T12:00:10.000Z", retryAfterSeconds: 10 }, now);
  assert.equal(blocked["retry-after"], "10");
  assert.equal(blocked["ratelimit-remaining"], "0");
});

test("a good request succeeds, carries the strip reference and limit headers, and is counted", async () => {
  const h = harness();
  const res = await h.handle(authed(), endpoint());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { data: { greeting: "hello world" } });
  assert.match(res.headers.get("x-request-id") ?? "", /^strip-/);
  assert.equal(res.headers.get("ratelimit-limit"), "2");
  assert.equal(res.headers.get("ratelimit-remaining"), "1");
  assert.deepEqual(h.recorded.map((r) => [r.endpoint, r.status, r.principal.kind]), [["hello.get", 200, "key"]]);
});

test("a missing or bad key is a 401 in the standard shape, with a request id, and is counted", async () => {
  const h = harness();
  const res = await h.handle(new Request("http://x/api"), endpoint());
  assert.equal(res.status, 401);
  const body = (await res.json()) as { error: { code: string; message: string; request_id: string } };
  assert.equal(body.error.code, "unauthorized");
  assert.equal(body.error.request_id, res.headers.get("x-request-id"));
  assert.equal(h.recorded[0]?.status, 401);
  assert.equal(h.recorded[0]?.principal.kind, "anonymous");
});

test("the authentication mode of the endpoint reaches the authenticator, and auth none skips it", async () => {
  const h = harness();
  await h.handle(authed(), endpoint({ auth: "either" }));
  await h.handle(new Request("http://x/api"), endpoint({ auth: "none" }));
  assert.deepEqual(h.modes, ["either"]);
});

test("past the per-minute limit the answer is 429 with Retry-After, and the strip does not run", async () => {
  const h = harness();
  assert.equal((await h.handle(authed(), endpoint())).status, 200);
  assert.equal((await h.handle(authed(), endpoint())).status, 200);
  const res = await h.handle(authed(), endpoint());
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("retry-after"), "30");
  assert.equal(res.headers.get("ratelimit-remaining"), "0");
  assert.equal(((await res.json()) as { error: { code: string } }).error.code, "rate_limited");
  assert.equal(h.recorded.filter((r) => r.status === 200).length, 2);
});

test("an anonymous caller is limited per address, using the first forwarded address", async () => {
  const h = harness({ anonymousRule: { limit: 1, windowMs: 60_000 } });
  const from = (ip: string) => new Request("http://x/api", { headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } });
  assert.equal((await h.handle(from("9.9.9.9"), endpoint({ auth: "none" }))).status, 200);
  assert.equal((await h.handle(from("9.9.9.9"), endpoint({ auth: "none" }))).status, 429);
  assert.equal((await h.handle(from("8.8.8.8"), endpoint({ auth: "none" }))).status, 200);
});

test("the monthly quota stops a key, with a Retry-After until next month", async () => {
  const h = harness();
  h.used.n = 5;
  const res = await h.handle(authed(), endpoint());
  assert.equal(res.status, 429);
  assert.match((await res.json() as { error: { message: string } }).error.message, /quota/);
  assert.ok(Number(res.headers.get("retry-after")) > 0);
  assert.equal(res.headers.get("ratelimit-limit"), "5");
  h.used.n = 4;
  assert.equal((await h.handle(authed(), endpoint())).status, 200);
});

test("an endpoint that needs a plan feature is forbidden without it", async () => {
  const h = harness({}, { perMinute: 9, perMonth: 9, features: [] });
  const res = await h.handle(authed(), endpoint({ feature: "export" }));
  assert.equal(res.status, 403);
  assert.match(((await res.json()) as { error: { message: string } }).error.message, /plan does not include/);
  const ok2 = harness({}, { perMinute: 9, perMonth: 9, features: ["export"] });
  assert.equal((await ok2.handle(authed(), endpoint({ feature: "export" }))).status, 200);
});

test("an internal error never leaks its text, and the reference is the strip's", async () => {
  const h = harness();
  const res = await h.handle(authed(), endpoint({ strip: boomStrip }));
  assert.equal(res.status, 500);
  const text = await res.text();
  assert.equal(text.includes("secret database detail"), false);
  const body = JSON.parse(text) as { error: { message: string; request_id: string } };
  assert.equal(body.error.message, "Something went wrong on our side.");
  assert.equal(body.error.request_id, res.headers.get("x-request-id"));
  assert.match(body.error.request_id, /^strip-/);
});

test("a user error shows its written message with its own status", async () => {
  const h = harness();
  const res = await h.handle(authed(), endpoint({ strip: nopeStrip }));
  assert.equal(res.status, 409);
  const text = await res.text();
  assert.equal(text.includes("internal text"), false);
  assert.match(text, /That name is taken\./);
});

test("when the limiter fails the request goes through, and the failure is reported and logged", async () => {
  const h = harness({ checkLimit: async () => err(makeError("network", "adapter:limiter/database", "", "store down")) });
  const res = await h.handle(authed(), endpoint());
  assert.equal(res.status, 200);
  assert.equal(h.reporter.reports.length, 1);
  assert.equal(h.logger.entries.some((e) => /rate limit check failed, continuing/.test(e.message ?? "")), true);
});

test("when counting fails the response does not change, and the failure is reported", async () => {
  const h = harness({ record: async (): Promise<Result<void>> => { throw new Error("db gone"); } });
  const res = await h.handle(authed(), endpoint());
  assert.equal(res.status, 200);
  assert.equal(h.reporter.reports.length, 1);
});

test("a request body that cannot be read is a 400", async () => {
  const h = harness();
  const res = await h.handle(authed(), endpoint({ input: () => { throw new Error("bad json"); } }));
  assert.equal(res.status, 400);
});

test("if the ports cannot be built the answer is a generic 500", async () => {
  const base = harness();
  void base;
  const deps: ApiDeps = {
    ports: async () => {
      throw new Error("no db");
    },
    authenticate: async () => ok(key),
    limitsFor: async () => ok({ perMinute: 1, perMonth: 1, features: [] }),
    usedThisMonth: async () => ok(0),
    record: async () => ok(undefined),
    checkLimit: async () => err(makeError("unexpected", "x", "", "x")),
  };
  const res = await createApiHandler(deps)(authed(), endpoint());
  assert.equal(res.status, 500);
  assert.equal((await res.text()).includes("no db"), false);
});
