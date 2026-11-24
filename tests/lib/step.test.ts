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
import { portError } from "../../src/lib/port-error.ts";
import { err, makeError, ok, typedError } from "../../src/lib/result.ts";
import { defineStep } from "../../src/lib/step.ts";
import type { Ports } from "../../src/lib/step.ts";

async function makePorts(env = "local") {
  const clock = createFixedClock("2026-11-23T12:00:00.000Z");
  const logger = createMemoryLogger({ env, clock });
  const database = createMemoryDatabase({ clock });
  const migrated = await database.migrate([
    { name: "users", fields: { email: { type: "string", unique: true, normalize: "lower" }, displayName: { type: "string", optional: true } } },
    { name: "orders", fields: { total: { type: "number" } } },
  ]);
  assert.equal(migrated.ok, true);
  const reporter = createMemoryReporter();
  const metrics = createMemoryMetrics();
  const ports: Ports = {
    env,
    reporter,
    metrics,
    auth: createMemoryAuth({ clock, ids: createSequenceIds("acct") }),
    payments: createFakePayments({ clock, ids: createSequenceIds("pay") }),
    limiter: createMemoryLimiter({ clock }),
    database,
    cache: createMemoryCache({ app: "t", env, schemaVersion: 1, clock, logger }),
    storage: createMemoryStorage(),
    clock,
    ids: createSequenceIds(),
    logger,
  };
  return { ports, logger, clock, metrics, reporter };
}

const run = (ports: Ports) => ({ stripId: "strip-1", ports });

const Name = z.object({ name: z.string().min(1) });
const Len = z.object({ length: z.number() });
const NONE = { reads: [], writes: [], storage: [] } as const;

test("a plain value is wrapped in ok and the output is parsed", async () => {
  const { ports } = await makePorts();
  const step = defineStep({
    name: "pure.name.length",
    class: "pure",
    input: Name,
    output: Len,
    permissions: NONE,
    errors: ["validation"],
    run: (input) => ({ length: input.name.length }),
  });
  assert.deepEqual(await step.execute({ name: "Ada" }, run(ports)), ok({ length: 3 }));
  assert.equal(step.manifest.name, "pure.name.length");
  assert.deepEqual(step.manifest.uses, []);
});

test("bad input and bad output are validation errors that name the step", async () => {
  const { ports } = await makePorts();
  const step = defineStep({
    name: "pure.name.broken",
    class: "pure",
    input: Name,
    output: Len,
    permissions: NONE,
    errors: ["validation"],
    run: () => ({ length: "three" as unknown as number }),
  });
  const badIn = await step.execute({ name: "" }, run(ports));
  assert.equal(badIn.ok, false);
  if (!badIn.ok) {
    assert.equal(badIn.error.kind, "validation");
    assert.equal(badIn.error.step, "pure.name.broken");
    assert.equal(badIn.error.stripId, "strip-1");
    assert.equal(badIn.error.audience, "internal");
    assert.match(badIn.error.message, /input rejected: name/);
  }
  const badOut = await step.execute({ name: "Ada" }, run(ports));
  assert.equal(badOut.ok, false);
  if (!badOut.ok) assert.match(badOut.error.message, /output rejected: length/);
});

test("a throw becomes unexpected, a typed error keeps its kind", async () => {
  const { ports } = await makePorts();
  const boom = defineStep({
    name: "pure.name.boom",
    class: "pure",
    input: Name,
    output: Len,
    permissions: NONE,
    errors: [],
    run: () => {
      throw new Error("secret detail");
    },
  });
  const r = await boom.execute({ name: "x" }, run(ports));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.error.kind, "unexpected");
    assert.equal(r.error.audience, "internal");
    assert.equal(r.error.userMessage, undefined);
    assert.equal(r.error.step, "pure.name.boom");
  }
  const limited = defineStep({
    name: "api.rate.limited",
    class: "api",
    input: Name,
    output: Len,
    permissions: NONE,
    errors: ["rate_limited"],
    run: async () => {
      throw typedError("rate_limited", "slow down", { retryable: true });
    },
  });
  const l = await limited.execute({ name: "x" }, run(ports));
  assert.equal(l.ok, false);
  if (!l.ok) {
    assert.equal(l.error.kind, "rate_limited");
    assert.equal(l.error.retryable, true);
  }
});

test("a Result from the function passes through unchanged", async () => {
  const { ports } = await makePorts();
  const e = makeError("conflict", "db.user.rename", "strip-1", "taken", { audience: "user", userMessage: "Name taken" });
  const step = defineStep({
    name: "db.user.rename",
    class: "db",
    input: Name,
    output: Len,
    permissions: NONE,
    errors: ["conflict"],
    run: async () => err(e),
  });
  const r = await step.execute({ name: "x" }, run(ports));
  assert.deepEqual(r, { ok: false, error: e });
});

test("an adapter error gets the real step and strip, and keeps its cause", async () => {
  const { ports } = await makePorts();
  const step = defineStep({
    name: "db.user.setDisplayName",
    class: "db",
    input: z.object({ id: z.string() }),
    output: z.object({ id: z.string() }),
    permissions: { reads: ["users"], writes: ["users"], storage: [] },
    errors: ["not_found"],
    uses: ["database"],
    run: async ({ id }, ctx) => {
      const updated = await ctx.database.write("users").update(id, { displayName: "x" });
      return updated.ok ? ok({ id }) : updated;
    },
  });
  const r = await step.execute({ id: "missing" }, run(ports));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.error.kind, "not_found");
    assert.equal(r.error.step, "db.user.setDisplayName");
    assert.equal(r.error.stripId, "strip-1");
  }
  const port = portError("conflict", "x/y", "m", { cause: new Error("c") });
  const passthrough = defineStep({
    name: "db.user.claim",
    class: "db",
    input: Name,
    output: Len,
    permissions: NONE,
    errors: ["conflict"],
    run: async () => err(port),
  });
  const c = await passthrough.execute({ name: "x" }, run(ports));
  assert.equal(c.ok, false);
  if (!c.ok) {
    assert.equal(c.error.step, "db.user.claim");
    assert.equal(c.error.cause instanceof Error, true);
    assert.equal("cause" in JSON.parse(JSON.stringify(c.error)), false);
  }
});

test("database access is limited to the declared collections", async () => {
  const { ports } = await makePorts();
  const step = defineStep({
    name: "db.order.peek",
    class: "db",
    input: Name,
    output: z.object({ outcome: z.string() }),
    permissions: { reads: ["users"], writes: [], storage: [] },
    errors: ["forbidden"],
    uses: ["database"],
    run: async (_input, ctx) => {
      // @ts-expect-error "orders" is not in reads or writes
      const denied = await ctx.database.read("orders").list();
      // @ts-expect-error writes is empty, so there is no write method
      assert.equal(ctx.database.write, undefined);
      const allowed = await ctx.database.read("users").list();
      return { outcome: `${denied.ok ? "allowed" : denied.error.kind}/${allowed.ok ? "allowed" : allowed.error.kind}` };
    },
  });
  assert.deepEqual(await step.execute({ name: "x" }, run(ports)), ok({ outcome: "forbidden/allowed" }));
});

test("write access is limited to declared collections, batch included", async () => {
  const { ports } = await makePorts();
  const step = defineStep({
    name: "db.user.createOnly",
    class: "db",
    input: Name,
    output: z.object({ outcome: z.string() }),
    permissions: { reads: [], writes: ["users"], storage: [] },
    errors: ["forbidden"],
    uses: ["database"],
    run: async (_input, ctx) => {
      // @ts-expect-error "orders" is not writable
      const denied = await ctx.database.write("orders").create({ id: "o1", total: 5 });
      const batchDenied = await ctx.database.batch([{ op: "create", collection: "orders", record: { id: "o2", total: 1 } }]);
      const created = await ctx.database.write("users").create({ id: "u1", email: "A@x.io" });
      return { outcome: [denied, batchDenied, created].map((r) => (r.ok ? "ok" : r.error.kind)).join(",") };
    },
  });
  assert.deepEqual(await step.execute({ name: "x" }, run(ports)), ok({ outcome: "forbidden,forbidden,ok" }));
  const stored = await ports.database.read("orders").list();
  assert.equal(stored.ok && stored.value.items.length, 0);
});

test("a step only gets the ports it names in uses", async () => {
  const { ports } = await makePorts();
  const step = defineStep({
    name: "pure.ctx.shape",
    class: "pure",
    input: Name,
    output: z.object({ keys: z.string() }),
    permissions: NONE,
    errors: [],
    uses: ["clock"],
    run: (_input, ctx) => {
      // @ts-expect-error database was not requested
      assert.equal(ctx.database, undefined);
      return { keys: Object.keys(ctx).sort().join(",") + ctx.clock.now() };
    },
  });
  const r = await step.execute({ name: "x" }, run(ports));
  assert.deepEqual(r, ok({ keys: "clock,log,stripId2026-11-23T12:00:00.000Z" }));
});

test("cache access is limited to declared namespaces and to reads or writes", async () => {
  const { ports } = await makePorts();
  const Profile = z.object({ n: z.number() });
  const writer = defineStep({
    name: "cache.profile.store",
    class: "cache",
    input: Name,
    output: z.object({ outcome: z.string() }),
    permissions: { reads: [], writes: ["cache:profile"], storage: [] },
    errors: ["forbidden"],
    uses: ["cache"],
    run: async (_input, ctx) => {
      const okSet = await ctx.cache.set("profile:u1", { n: 1 }, { ttlMs: 1000 });
      const badSet = await ctx.cache.set("session:u1", { n: 1 }, { ttlMs: 1000 });
      const badDelete = await ctx.cache.deleteByPrefix("sess");
      return { outcome: [okSet, badSet, badDelete].map((r) => (r.ok ? "ok" : r.error.kind)).join(",") };
    },
  });
  assert.deepEqual(await writer.execute({ name: "x" }, run(ports)), ok({ outcome: "ok,forbidden,forbidden" }));

  const reader = defineStep({
    name: "cache.profile.peek",
    class: "cache",
    input: Name,
    output: z.object({ outcome: z.string() }),
    permissions: { reads: ["cache:profile"], writes: [], storage: [] },
    errors: ["forbidden"],
    uses: ["cache"],
    run: async (_input, ctx) => {
      // @ts-expect-error reads only: there is no set method
      assert.equal(ctx.cache.set, undefined);
      const hit = await ctx.cache.get("profile:u1", Profile);
      const bad = await ctx.cache.get("session:u1", Profile);
      return { outcome: `${hit.ok && hit.value.hit ? "hit" : "miss"},${bad.ok ? "ok" : bad.error.kind}` };
    },
  });
  assert.deepEqual(await reader.execute({ name: "x" }, run(ports)), ok({ outcome: "hit,forbidden" }));
});

test("storage access is limited to declared prefixes", async () => {
  const { ports } = await makePorts();
  const step = defineStep({
    name: "storage.avatar.save",
    class: "storage",
    input: Name,
    output: z.object({ outcome: z.string() }),
    permissions: { reads: [], writes: [], storage: ["avatars/"] },
    errors: ["forbidden"],
    uses: ["storage"],
    run: async (_input, ctx) => {
      const a = await ctx.storage.put("avatars/u1.png", new Uint8Array([1]), { contentType: "image/png" });
      const b = await ctx.storage.put("private/u1.png", new Uint8Array([1]), { contentType: "image/png" });
      const c = await ctx.storage.list("");
      return { outcome: [a, b, c].map((r) => (r.ok ? "ok" : r.error.kind)).join(",") };
    },
  });
  assert.deepEqual(await step.execute({ name: "x" }, run(ports)), ok({ outcome: "ok,forbidden,forbidden" }));
});

test("entry and exit are logged with the plan's entry shape", async () => {
  const { ports, logger } = await makePorts();
  const step = defineStep({
    name: "pure.name.length",
    class: "pure",
    input: Name,
    output: Len,
    permissions: NONE,
    errors: [],
    run: (input) => ({ length: input.name.length }),
  });
  await step.execute({ name: "Ada" }, run(ports));
  const [start, end] = logger.entries;
  assert.equal(start?.phase, "start");
  assert.equal(start?.step, "pure.name.length");
  assert.equal(start?.class, "pure");
  assert.equal(start?.stripId, "strip-1");
  assert.deepEqual(start?.input, { name: "Ada" });
  assert.equal(end?.phase, "end");
  assert.equal(end?.ok, true);
  assert.equal(typeof end?.ms, "number");
  assert.deepEqual(end?.output, { length: 3 });
});

test("in prod the log lines carry no payload", async () => {
  const { ports, logger } = await makePorts("prod");
  const step = defineStep({
    name: "pure.name.length",
    class: "pure",
    input: Name,
    output: Len,
    permissions: NONE,
    errors: [],
    run: (input) => ({ length: input.name.length }),
  });
  await step.execute({ name: "Ada" }, run(ports));
  assert.equal(logger.entries.every((e) => e.input === undefined && e.output === undefined), true);
});

test("an error kind the manifest does not declare is logged at debug level", async () => {
  const { ports, logger } = await makePorts();
  const step = defineStep({
    name: "db.user.liar",
    class: "db",
    input: Name,
    output: Len,
    permissions: NONE,
    errors: ["not_found"],
    run: async () => err(makeError("conflict", "db.user.liar", "strip-1", "dup")),
  });
  const r = await step.execute({ name: "x" }, run(ports));
  assert.equal(r.ok, false);
  assert.equal(logger.entries.some((e) => e.phase === "debug" && /does not declare/.test(e.message ?? "")), true);
});

test("a logger that throws does not fail the step, and the step never throws", async () => {
  const { ports } = await makePorts();
  const step = defineStep({
    name: "pure.name.length",
    class: "pure",
    input: Name,
    output: Len,
    permissions: NONE,
    errors: [],
    run: (input) => ({ length: input.name.length }),
  });
  const throwing = { ...ports, logger: { log: () => { throw new Error("log down"); } } };
  assert.deepEqual(await step.execute({ name: "Ada" }, run(throwing)), ok({ length: 3 }));
});

test("step input and output types are inferred for chaining", () => {
  const step = defineStep({
    name: "pure.name.length",
    class: "pure",
    input: Name,
    output: Len,
    permissions: NONE,
    errors: [],
    run: (input) => ({ length: input.name.length }),
  });
  const typed: Promise<unknown> = step.execute({ name: "x" }, { stripId: "s", ports: undefined as never });
  void typed;
  // @ts-expect-error wrong input shape
  void step.execute({ nam: "x" }, { stripId: "s", ports: undefined as never });
});

test("each run emits a step duration with the step name and the outcome", async () => {
  const { ports, metrics } = await makePorts();
  const step = defineStep({
    name: "pure.name.length",
    class: "pure",
    input: Name,
    output: Len,
    permissions: NONE,
    errors: [],
    run: (input) => ({ length: input.name.length }),
  });
  await step.execute({ name: "Ada" }, run(ports));
  await step.execute({ name: "" }, run(ports));
  assert.deepEqual(metrics.points.map((p) => [p.type, p.name, p.tags]), [
    ["timing", "step.duration_ms", { step: "pure.name.length", outcome: "ok" }],
    ["timing", "step.duration_ms", { step: "pure.name.length", outcome: "error", kind: "validation" }],
  ]);
});

test("a metrics adapter that throws does not change the step result", async () => {
  const { ports } = await makePorts();
  const broken = { ...ports, metrics: { increment: () => { throw new Error("down"); }, timing: () => { throw new Error("down"); } } };
  const step = defineStep({
    name: "pure.name.length",
    class: "pure",
    input: Name,
    output: Len,
    permissions: NONE,
    errors: [],
    run: (input) => ({ length: input.name.length }),
  });
  assert.deepEqual(await step.execute({ name: "Ada" }, run(broken)), ok({ length: 3 }));
});

test("steps cannot reach the reporter or the metrics port", async () => {
  const { ports } = await makePorts();
  const step = defineStep({
    name: "pure.ctx.telemetry",
    class: "pure",
    input: Name,
    output: z.object({ keys: z.string() }),
    permissions: NONE,
    errors: [],
    uses: ["clock", "ids"],
    run: (_input, ctx) => {
      // @ts-expect-error telemetry is not part of a step's context
      assert.equal(ctx.metrics, undefined);
      // @ts-expect-error telemetry is not part of a step's context
      assert.equal(ctx.reporter, undefined);
      return { keys: Object.keys(ctx).sort().join(",") };
    },
  });
  assert.deepEqual(await step.execute({ name: "x" }, run(ports)), ok({ keys: "clock,ids,log,stripId" }));
});

test("a sensitive step logs no input, no output and no error text, in any environment", async () => {
  for (const env of ["local", "dev", "prod"]) {
    const { ports, logger, reporter } = await makePorts(env);
    const step = defineStep({
      name: "db.accounts.create",
      class: "db",
      input: z.object({ email: z.string(), password: z.string() }),
      output: z.object({ token: z.string() }),
      permissions: NONE,
      errors: ["conflict"],
      sensitive: true,
      run: (i, ctx) =>
        i.email === "taken@example.com"
          ? err(makeError("conflict", "db.accounts.create", ctx.stripId, `password ${i.password} rejected`, { cause: new Error(i.password) }))
          : { token: `tok-${i.password}` },
    });
    await step.execute({ email: "a@b.c", password: "hunter2-hunter2" }, run(ports));
    await step.execute({ email: "taken@example.com", password: "hunter2-hunter2" }, run(ports));
    const everything = JSON.stringify([logger.entries, reporter.reports.map((r) => r.context)]);
    assert.equal(everything.includes("hunter2"), false, `${env}: ${everything}`);
    assert.equal(everything.includes("a@b.c"), false);
    const end = logger.entries.filter((e) => e.phase === "end");
    assert.equal(end.length, 2);
    assert.equal(end[1]?.error?.kind, "conflict");
    assert.equal(end[1]?.error?.message, undefined);
    assert.equal(step.manifest.sensitive, true);
  }
});

test("a step is not sensitive unless it says so", () => {
  const step = defineStep({ name: "pure.name.plain", class: "pure", input: Name, output: Len, permissions: NONE, errors: [], run: (i) => ({ length: i.name.length }) });
  assert.equal(step.manifest.sensitive, false);
});

test("a step gets the auth and payments ports only when it names them, and never the limiter", async () => {
  const { ports } = await makePorts();
  const step = defineStep({
    name: "pure.ctx.platform",
    class: "pure",
    input: Name,
    output: z.object({ keys: z.string(), auth: z.string(), payments: z.string() }),
    permissions: NONE,
    errors: [],
    uses: ["auth", "payments"],
    run: (_input, ctx) => {
      // @ts-expect-error the rate limiter belongs to the API pipeline, not to steps
      assert.equal(ctx.limiter, undefined);
      return { keys: Object.keys(ctx).sort().join(","), auth: ctx.auth.name, payments: ctx.payments.name };
    },
  });
  assert.deepEqual(await step.execute({ name: "x" }, run(ports)), ok({ keys: "auth,log,payments,stripId", auth: "memory", payments: "fake" }));
  const plain = defineStep({
    name: "pure.ctx.plain",
    class: "pure",
    input: Name,
    output: z.object({ has: z.boolean() }),
    permissions: NONE,
    errors: [],
    run: (_input, ctx) => {
      // @ts-expect-error auth was not requested
      return { has: ctx.auth !== undefined };
    },
  });
  assert.deepEqual(await plain.execute({ name: "x" }, run(ports)), ok({ has: false }));
});
