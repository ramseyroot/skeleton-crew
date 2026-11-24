import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { createFixedClock } from "../../src/adapters/clock/fixed/index.ts";
import { createMemoryAuth } from "../../src/adapters/auth/memory/index.ts";
import { createMemoryLimiter } from "../../src/adapters/limiter/memory/index.ts";
import { createFakePayments } from "../../src/adapters/payments/fake/index.ts";
import { createMemoryCache } from "../../src/adapters/cache/memory/index.ts";
import { createMemoryDatabase } from "../../src/adapters/database/memory/index.ts";
import { createSequenceIds } from "../../src/adapters/ids/sequence/index.ts";
import { createMemoryLogger } from "../../src/adapters/logger/memory/index.ts";
import { createMemoryMetrics } from "../../src/adapters/metrics/memory/index.ts";
import { createMemoryReporter } from "../../src/adapters/reporter/memory/index.ts";
import { createMemoryStorage } from "../../src/adapters/storage/memory/index.ts";
import { err, makeError } from "../../src/lib/result.ts";
import { defineStep } from "../../src/lib/step.ts";
import type { Ports } from "../../src/lib/step.ts";
import { defineStrip, runStrip } from "../../src/lib/strip.ts";

async function makePorts() {
  const clock = createFixedClock("2026-11-23T12:00:00.000Z");
  const logger = createMemoryLogger({ env: "local", clock });
  const database = createMemoryDatabase({ clock });
  await database.migrate([{ name: "users", fields: { displayName: { type: "string", optional: true } } }]);
  await database.write("users").create({ id: "u1", displayName: "Old" });
  const cache = createMemoryCache({ app: "t", env: "local", schemaVersion: 1, clock, logger });
  const reporter = createMemoryReporter();
  const metrics = createMemoryMetrics();
  const ports: Ports = { env: "local", database, cache, storage: createMemoryStorage(), clock, ids: createSequenceIds("strip"), logger, reporter, metrics, auth: createMemoryAuth({ clock, ids: createSequenceIds("acct") }), payments: createFakePayments({ clock, ids: createSequenceIds("pay") }), limiter: createMemoryLimiter({ clock }) };
  return { ports, logger, cache, database, reporter, metrics };
}

const NONE = { reads: [], writes: [], storage: [] } as const;
const Form = z.object({ userId: z.string(), name: z.string() });
const Done = z.object({ id: z.string(), displayName: z.string() });

const parse = defineStep({
  name: "pure.t.parse",
  class: "pure",
  input: Form,
  output: Form,
  permissions: NONE,
  errors: ["validation"],
  run: (input) =>
    input.name.trim() === ""
      ? err(makeError("validation", "pure.t.parse", "", "empty", { audience: "user", userMessage: "Please enter a name" }))
      : { userId: input.userId, name: input.name.trim() },
});

const rename = defineStep({
  name: "db.t.rename",
  class: "db",
  input: Form,
  output: Done,
  permissions: { reads: ["users"], writes: ["users"], storage: [] },
  errors: ["not_found"],
  uses: ["database"],
  run: async (input, ctx) => {
    const r = await ctx.database.write("users").update(input.userId, { displayName: input.name });
    return r.ok ? { id: input.userId, displayName: input.name } : r;
  },
});

const base = {
  name: "profile.t",
  budget: { reads: ["users"], writes: ["users"], storage: [] },
  invalidates: ["profile:{userId}"],
} as const;

test("a strip runs its steps in order and returns the last value with its stripId", async () => {
  const { ports, logger } = await makePorts();
  const strip = defineStrip({ ...base, steps: [parse, rename], routing: { "*": "abort" } });
  const r = await runStrip(strip, ports, { userId: "u1", name: "  Ada " });
  assert.deepEqual(r, { ok: true, value: { id: "u1", displayName: "Ada" }, stripId: "strip-1" });
  const stored = await ports.database.read("users").get("u1");
  assert.equal(stored.ok && stored.value?.displayName, "Ada");
  assert.deepEqual(
    logger.entries.map((e) => `${e.step}:${e.phase}`),
    ["profile.t:start", "pure.t.parse:start", "pure.t.parse:end", "db.t.rename:start", "db.t.rename:end", "profile.t:end"],
  );
  assert.equal(logger.entries.every((e) => e.stripId === "strip-1"), true);
});

test("a step whose output does not fit the next input fails the typecheck", () => {
  // @ts-expect-error db.t.rename outputs Done, which is not the Form that pure.t.parse needs
  defineStrip({ ...base, steps: [rename, parse], routing: { "*": "abort" } });
});

test("log-and-continue is refused by the types unless the failed step's input fits the next step", () => {
  // @ts-expect-error rename's input (Form) does not fit the strip's end, so it cannot be skipped
  defineStrip({ ...base, steps: [parse, rename], routing: { "db.t.rename": "log-and-continue", "*": "abort" } });
});

test("a recover route must name a listed fallback", () => {
  assert.throws(
    // @ts-expect-error "nope" is not a fallback
    () => defineStrip({ ...base, steps: [parse, rename], routing: { "*": "abort", "db.t.rename": "recover:nope" } }),
    /which is not in `fallbacks`/,
  );
});

test("load-time checks: budget, routing, invalidates, actions, duplicates", () => {
  const steps = [parse, rename] as const;
  assert.throws(
    () => defineStrip({ ...base, budget: { reads: ["users"], writes: [], storage: [] }, steps, routing: { "*": "abort" } }),
    /step "db.t.rename" needs writes: users, which the strip budget does not allow/,
  );
  assert.throws(
    () => defineStrip({ ...base, steps, routing: { "pure.t.parse": "abort" } }),
    /step "db.t.rename" has no routing entry and there is no "\*" entry/,
  );
  assert.throws(
    // @ts-expect-error routing key that is not a step of the strip
    () => defineStrip({ ...base, steps, routing: { "*": "abort", "db.t.other": "abort" } }),
    /"db.t.other", which is not a step/,
  );
  assert.throws(
    () => defineStrip({ ...base, steps, routing: { "*": "retry:x" as "abort" } }),
    /invalid action/,
  );
  assert.throws(
    () => defineStrip({ ...base, steps, routing: { "*": "abort" }, invalidates: undefined as unknown as string[] }),
    /step "db.t.rename" writes, so `invalidates` is required/,
  );
  assert.throws(
    () => defineStrip({ ...base, steps: [parse, parse], routing: { "*": "abort" } }),
    /listed twice/,
  );
  assert.doesNotThrow(() => defineStrip({ ...base, steps, invalidates: [], routing: { "*": "abort" } }));
});

test("a successful write removes the listed cache keys", async () => {
  const { ports, cache } = await makePorts();
  await cache.set("profile:u1", { n: 1 }, { ttlMs: 60_000 });
  await cache.set("profile:u2", { n: 2 }, { ttlMs: 60_000 });
  const strip = defineStrip({ ...base, steps: [parse, rename], routing: { "*": "abort" } });
  const r = await runStrip(strip, ports, { userId: "u1", name: "Ada" });
  assert.equal(r.ok, true);
  const gone = await cache.get("profile:u1", z.object({ n: z.number() }));
  const kept = await cache.get("profile:u2", z.object({ n: z.number() }));
  assert.deepEqual(gone.ok && gone.value.hit, false);
  assert.deepEqual(kept.ok && kept.value.hit, true);
});

test("a failed strip invalidates nothing", async () => {
  const { ports, cache } = await makePorts();
  await cache.set("profile:ghost", { n: 1 }, { ttlMs: 60_000 });
  const strip = defineStrip({ ...base, steps: [parse, rename], routing: { "*": "abort" } });
  const r = await runStrip(strip, ports, { userId: "ghost", name: "Ada" });
  assert.equal(r.ok, false);
  const still = await cache.get("profile:ghost", z.object({ n: z.number() }));
  assert.equal(still.ok && still.value.hit, true);
});

test("a missing placeholder is logged as a validation problem and does not fail the finished write", async () => {
  const { ports, logger } = await makePorts();
  const strip = defineStrip({ ...base, invalidates: ["profile:{account}"], steps: [parse, rename], routing: { "*": "abort" } });
  const r = await runStrip(strip, ports, { userId: "u1", name: "Ada" });
  assert.equal(r.ok, true);
  const skipped = logger.entries.find((e) => /skipped/.test(e.message ?? ""));
  assert.equal(skipped?.error?.kind, "validation");
});

test("a user error is shown as a toast, an internal error as a generic message with the stripId", async () => {
  const { ports } = await makePorts();
  const strip = defineStrip({
    ...base,
    steps: [parse, rename],
    routing: { "pure.t.parse": { validation: "toast" }, "*": "abort" },
  });
  const user = await runStrip(strip, ports, { userId: "u1", name: "   " });
  assert.equal(user.ok, false);
  if (!user.ok) {
    assert.equal(user.error.kind, "validation");
    assert.deepEqual(user.display, { type: "toast", message: "Please enter a name" });
  }
  const internal = await runStrip(strip, ports, { userId: "ghost", name: "Ada" });
  assert.equal(internal.ok, false);
  if (!internal.ok) {
    assert.equal(internal.error.kind, "not_found");
    assert.deepEqual(internal.display, { type: "generic", reference: internal.stripId });
  }
});

test("toast on an internal error never exposes its message", async () => {
  const { ports } = await makePorts();
  const strip = defineStrip({ ...base, steps: [parse, rename], routing: { "db.t.rename": { not_found: "toast" }, "*": "abort" } });
  const r = await runStrip(strip, ports, { userId: "ghost", name: "Ada" });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.display.type, "generic");
    assert.equal(JSON.stringify(r.display).includes(r.error.message), false);
  }
});

function flaky(failures: number, retryable: boolean) {
  const calls = { n: 0 };
  const step = defineStep({
    name: "api.t.flaky",
    class: "api",
    input: Form,
    output: Form,
    permissions: NONE,
    errors: ["network"],
    run: (input) => {
      calls.n += 1;
      return calls.n <= failures ? err(makeError("network", "api.t.flaky", "", "timeout", { retryable })) : input;
    },
  });
  return { step, calls };
}

test("retry runs a retryable failure again, up to n times", async () => {
  const { ports } = await makePorts();
  const ok2 = flaky(2, true);
  const strip = defineStrip({ ...base, invalidates: [], steps: [ok2.step], routing: { "api.t.flaky": { network: "retry:2" }, "*": "abort" } });
  const r = await runStrip(strip, ports, { userId: "u1", name: "Ada" });
  assert.equal(r.ok, true);
  assert.equal(ok2.calls.n, 3);

  const tooMany = flaky(3, true);
  const strip2 = defineStrip({ ...base, invalidates: [], steps: [tooMany.step], routing: { "api.t.flaky": { network: "retry:2" }, "*": "abort" } });
  const r2 = await runStrip(strip2, ports, { userId: "u1", name: "Ada" });
  assert.equal(r2.ok, false);
  assert.equal(tooMany.calls.n, 3);
});

test("retry does nothing for an error that is not retryable", async () => {
  const { ports } = await makePorts();
  const f = flaky(5, false);
  const strip = defineStrip({ ...base, invalidates: [], steps: [f.step], routing: { "api.t.flaky": "retry:3", "*": "abort" } });
  const r = await runStrip(strip, ports, { userId: "u1", name: "Ada" });
  assert.equal(r.ok, false);
  assert.equal(f.calls.n, 1);
});

test("log-and-continue skips a failed step and passes its input on", async () => {
  const { ports, logger } = await makePorts();
  const Id = z.object({ userId: z.string() });
  const enrich = defineStep({
    name: "api.t.enrich",
    class: "api",
    input: Id,
    output: z.object({ userId: z.string(), tag: z.string() }),
    permissions: NONE,
    errors: ["upstream"],
    run: () => err(makeError("upstream", "api.t.enrich", "", "down")),
  });
  const use = defineStep({
    name: "pure.t.use",
    class: "pure",
    input: Id,
    output: z.object({ seen: z.string() }),
    permissions: NONE,
    errors: [],
    run: (input) => ({ seen: input.userId }),
  });
  const strip = defineStrip({
    ...base,
    invalidates: [],
    steps: [enrich, use],
    routing: { "api.t.enrich": "log-and-continue", "*": "abort" },
  });
  const r = await runStrip(strip, ports, { userId: "u1" });
  assert.deepEqual(r, { ok: true, value: { seen: "u1" }, stripId: "strip-1" });
  assert.equal(logger.entries.some((e) => /continuing/.test(e.message ?? "")), true);
});

test("recover runs the fallback with the failed step's input", async () => {
  const { ports } = await makePorts();
  const primary = defineStep({
    name: "cache.t.primary",
    class: "cache",
    input: Form,
    output: Done,
    permissions: NONE,
    errors: ["network"],
    run: () => err(makeError("network", "cache.t.primary", "", "down")),
  });
  const backup = defineStep({
    name: "pure.t.backup",
    class: "pure",
    input: Form,
    output: Done,
    permissions: NONE,
    errors: [],
    run: (input) => ({ id: input.userId, displayName: "from backup" }),
  });
  const strip = defineStrip({
    ...base,
    invalidates: [],
    steps: [primary],
    fallbacks: [backup],
    routing: { "cache.t.primary": "recover:pure.t.backup", "*": "abort" },
  });
  const r = await runStrip(strip, ports, { userId: "u1", name: "Ada" });
  assert.deepEqual(r, { ok: true, value: { id: "u1", displayName: "from backup" }, stripId: "strip-1" });
});

test("a kind with no entry falls back to the strip's \"*\" route", async () => {
  const { ports } = await makePorts();
  const strip = defineStrip({ ...base, steps: [parse, rename], routing: { "db.t.rename": { conflict: "toast" }, "*": "abort" } });
  const r = await runStrip(strip, ports, { userId: "ghost", name: "Ada" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.display.type, "generic");
});

test("the runner never throws", async () => {
  const { ports } = await makePorts();
  const strip = defineStrip({ ...base, steps: [parse, rename], routing: { "*": "abort" } });
  const brokenIds = { ...ports, ids: { next: (): string => { throw new Error("ids down"); } } };
  const a = await runStrip(strip, brokenIds, { userId: "u1", name: "Ada" });
  assert.equal(a.ok, false);
  const brokenCache = { ...ports, cache: { ...ports.cache, delete: async (): Promise<never> => { throw new Error("cache down"); } } };
  const b = await runStrip(strip, brokenCache, { userId: "u1", name: "Ada" });
  assert.equal(b.ok, false);
  if (!b.ok) assert.equal(b.error.kind, "unexpected");
});

test("the strip's input and output types come from its first and last step", async () => {
  const { ports } = await makePorts();
  const strip = defineStrip({ ...base, steps: [parse, rename], routing: { "*": "abort" } });
  // @ts-expect-error the input must be a Form
  await runStrip(strip, ports, { wrong: true });
  const r = await runStrip(strip, ports, { userId: "u1", name: "Ada" });
  if (r.ok) {
    const done: { id: string; displayName: string } = r.value;
    assert.equal(done.id, "u1");
  }
});

// ---- telemetry ----------------------------------------------------------------

const exploding = (kind: "unexpected" | "network" | "not_found", audience: "internal" | "user" = "internal") =>
  defineStep({
    name: "api.t.exploding",
    class: "api",
    input: Form,
    output: Form,
    permissions: NONE,
    errors: ["network", "not_found"],
    run: () =>
      err(
        audience === "user"
          ? makeError(kind, "api.t.exploding", "", "boom", { audience: "user", userMessage: "Try later" })
          : makeError(kind, "api.t.exploding", "", "boom"),
      ),
  });

test("a strip that ends in an unexpected internal error is reported once, with its strip and reference", async () => {
  const { ports, reporter } = await makePorts();
  const strip = defineStrip({ ...base, invalidates: [], steps: [exploding("unexpected")], routing: { "*": "abort" } });
  const r = await runStrip(strip, ports, { userId: "u1", name: "Ada" });
  assert.equal(r.ok, false);
  assert.equal(reporter.reports.length, 1);
  const [report] = reporter.reports;
  assert.equal(report?.error.kind, "unexpected");
  assert.deepEqual(report?.context, { strip: "profile.t", stripId: "strip-1", env: "local" });
});

test("upstream and network failures are reported too", async () => {
  const { ports, reporter } = await makePorts();
  const strip = defineStrip({ ...base, invalidates: [], steps: [exploding("network")], routing: { "*": "abort" } });
  await runStrip(strip, ports, { userId: "u1", name: "Ada" });
  assert.deepEqual(reporter.reports.map((r) => r.error.kind), ["network"]);
});

test("expected outcomes and user errors are not reported", async () => {
  const { ports, reporter } = await makePorts();
  const missing = defineStrip({ ...base, invalidates: [], steps: [exploding("not_found")], routing: { "*": "abort" } });
  await runStrip(missing, ports, { userId: "u1", name: "Ada" });
  const userNetwork = defineStrip({ ...base, invalidates: [], steps: [exploding("network", "user")], routing: { "*": "toast" } });
  await runStrip(userNetwork, ports, { userId: "u1", name: "Ada" });
  const strip = defineStrip({ ...base, steps: [parse, rename], routing: { "pure.t.parse": { validation: "toast" }, "*": "abort" } });
  await runStrip(strip, ports, { userId: "u1", name: "   " });
  await runStrip(strip, ports, { userId: "ghost", name: "Ada" });
  assert.equal(reporter.reports.length, 0);
});

test("a success, a skipped step, a recovered step and a retry that works are not reported", async () => {
  const { ports, reporter } = await makePorts();
  const ok1 = defineStrip({ ...base, steps: [parse, rename], routing: { "*": "abort" } });
  await runStrip(ok1, ports, { userId: "u1", name: "Ada" });

  const f = flaky(1, true);
  const retried = defineStrip({ ...base, invalidates: [], steps: [f.step], routing: { "api.t.flaky": { network: "retry:2" }, "*": "abort" } });
  assert.equal((await runStrip(retried, ports, { userId: "u1", name: "Ada" })).ok, true);

  const down = exploding("network");
  const backup = defineStep({ name: "pure.t.backup", class: "pure", input: Form, output: Form, permissions: NONE, errors: [], run: (i) => i });
  const recovered = defineStrip({ ...base, invalidates: [], steps: [down], fallbacks: [backup], routing: { "api.t.exploding": "recover:pure.t.backup", "*": "abort" } });
  assert.equal((await runStrip(recovered, ports, { userId: "u1", name: "Ada" })).ok, true);

  const skipped = defineStrip({ ...base, invalidates: [], steps: [exploding("network")], routing: { "api.t.exploding": "log-and-continue", "*": "abort" } });
  assert.equal((await runStrip(skipped, ports, { userId: "u1", name: "Ada" })).ok, true);
  assert.equal(reporter.reports.length, 0);
});

test("a retry that runs out is reported once, not once per attempt", async () => {
  const { ports, reporter } = await makePorts();
  const f = flaky(5, true);
  const strip = defineStrip({ ...base, invalidates: [], steps: [f.step], routing: { "api.t.flaky": { network: "retry:2" }, "*": "abort" } });
  const r = await runStrip(strip, ports, { userId: "u1", name: "Ada" });
  assert.equal(r.ok, false);
  assert.equal(f.calls.n, 3);
  assert.equal(reporter.reports.length, 1);
});

test("a reporter or metrics adapter that throws does not change the strip's result", async () => {
  const { ports } = await makePorts();
  const throwing = {
    ...ports,
    reporter: { report: () => { throw new Error("tracker down"); } },
    metrics: { increment: () => { throw new Error("down"); }, timing: () => { throw new Error("down"); } },
  };
  const strip = defineStrip({ ...base, invalidates: [], steps: [exploding("unexpected")], routing: { "*": "abort" } });
  const r = await runStrip(strip, throwing, { userId: "u1", name: "Ada" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.kind, "unexpected");
});

test("a run emits strip.runs and strip.duration_ms with the strip, the outcome and, on failure, the kind", async () => {
  const { ports, metrics } = await makePorts();
  const strip = defineStrip({ ...base, steps: [parse, rename], routing: { "*": "abort" } });
  await runStrip(strip, ports, { userId: "u1", name: "Ada" });
  await runStrip(strip, ports, { userId: "ghost", name: "Ada" });
  const strips = metrics.points.filter((p) => p.name.startsWith("strip."));
  assert.deepEqual(strips.map((p) => [p.name, p.tags]), [
    ["strip.runs", { strip: "profile.t", outcome: "ok" }],
    ["strip.duration_ms", { strip: "profile.t", outcome: "ok" }],
    ["strip.runs", { strip: "profile.t", outcome: "error", kind: "not_found" }],
    ["strip.duration_ms", { strip: "profile.t", outcome: "error", kind: "not_found" }],
  ]);
  assert.equal(metrics.points.some((p) => p.name === "step.duration_ms" && p.tags.step === "db.t.rename"), true);
});

// ---- sensitive strips -----------------------------------------------------------

test("a strip with a sensitive step is sensitive, and nothing of its input or error text is logged or reported", async () => {
  const secretStep = defineStep({
    name: "api.t.secret",
    class: "api",
    input: Form,
    output: Form,
    permissions: NONE,
    errors: ["network"],
    sensitive: true,
    run: (i, ctx) => err(makeError("unexpected", "api.t.secret", ctx.stripId, `failed for ${i.name}`)),
  });
  for (const env of ["local", "prod"]) {
    const { ports, logger, reporter } = await makePorts();
    const p = { ...ports, env };
    const strip = defineStrip({ ...base, invalidates: [], steps: [secretStep], routing: { "*": "abort" } });
    assert.equal(strip.sensitive, true);
    const r = await runStrip(strip, p, { userId: "u1", name: "hunter2-hunter2" });
    assert.equal(r.ok, false);
    const everything = JSON.stringify([logger.entries, reporter.reports.map((x) => [x.error.message, x.context])]);
    assert.equal(everything.includes("hunter2"), false, everything);
    assert.equal(reporter.reports.length, 1);
    assert.equal(reporter.reports[0]?.error.kind, "unexpected");
  }
});

test("a strip without a sensitive step is not sensitive, and can be marked so", () => {
  assert.equal(defineStrip({ ...base, steps: [parse, rename], routing: { "*": "abort" } }).sensitive, false);
  assert.equal(defineStrip({ ...base, sensitive: true, steps: [parse, rename], routing: { "*": "abort" } }).sensitive, true);
});
