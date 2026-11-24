// Contract suite for the RateLimiter port. Each adapter's test file calls runLimiterContract with a factory.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Allowance, RateLimiter, Rule } from "../../ports/limiter.ts";
import type { FixedClock } from "../clock/fixed/index.ts";

export type LimiterHarness = { limiter: RateLimiter; clock: FixedClock };
export type MakeLimiter = () => LimiterHarness;

const RULE: Rule = { limit: 3, windowMs: 60_000 };

async function allow(limiter: RateLimiter, key: string, rule: Rule = RULE): Promise<Allowance> {
  const res = await limiter.check(key, rule);
  assert.equal(res.ok, true, "check should succeed");
  if (!res.ok) throw new Error("unreachable");
  return res.value;
}

export function runLimiterContract(name: string, make: MakeLimiter): void {
  test(`${name}: counts requests, remaining goes down, the first over the limit is not allowed`, async () => {
    const { limiter } = make();
    const seen: Array<[boolean, number]> = [];
    for (let i = 0; i < 5; i += 1) {
      const a = await allow(limiter, "k");
      seen.push([a.allowed, a.remaining]);
      assert.equal(a.limit, 3);
    }
    assert.deepEqual(seen, [
      [true, 2],
      [true, 1],
      [true, 0],
      [false, 0],
      [false, 0],
    ]);
  });

  test(`${name}: exceeding the limit is a value, not an error`, async () => {
    const { limiter } = make();
    for (let i = 0; i < 3; i += 1) await allow(limiter, "k");
    const res = await limiter.check("k", RULE);
    assert.equal(res.ok, true);
    assert.equal(res.ok && res.value.allowed, false);
  });

  test(`${name}: resetAt is the end of the epoch-aligned window and retryAfterSeconds counts down to it`, async () => {
    const { limiter, clock } = make();
    clock.set("2026-01-01T00:00:20.500Z");
    const first = await allow(limiter, "k");
    assert.equal(first.resetAt, "2026-01-01T00:01:00.000Z");
    assert.equal(first.retryAfterSeconds, 0);
    for (let i = 0; i < 2; i += 1) await allow(limiter, "k");
    const denied = await allow(limiter, "k");
    assert.equal(denied.allowed, false);
    assert.equal(denied.resetAt, "2026-01-01T00:01:00.000Z");
    assert.equal(denied.retryAfterSeconds, 40); // ceil(39.5)
    clock.set("2026-01-01T00:00:59.999Z");
    const late = await allow(limiter, "k");
    assert.equal(late.allowed, false);
    assert.equal(late.retryAfterSeconds, 1); // at least 1
  });

  test(`${name}: the count starts again in the next window`, async () => {
    const { limiter, clock } = make();
    for (let i = 0; i < 4; i += 1) await allow(limiter, "k");
    assert.equal((await allow(limiter, "k")).allowed, false);
    clock.advance(60_000);
    const next = await allow(limiter, "k");
    assert.equal(next.allowed, true);
    assert.equal(next.remaining, 2);
    assert.equal(next.resetAt, "2026-01-01T00:02:00.000Z");
  });

  test(`${name}: different keys are counted separately`, async () => {
    const { limiter } = make();
    for (let i = 0; i < 4; i += 1) await allow(limiter, "a");
    assert.equal((await allow(limiter, "a")).allowed, false);
    const b = await allow(limiter, "b");
    assert.equal(b.allowed, true);
    assert.equal(b.remaining, 2);
  });

  test(`${name}: the same key with a different windowMs is counted separately`, async () => {
    const { limiter } = make();
    for (let i = 0; i < 4; i += 1) await allow(limiter, "k");
    const other = await allow(limiter, "k", { limit: 3, windowMs: 3_600_000 });
    assert.equal(other.allowed, true);
    assert.equal(other.remaining, 2);
    assert.equal(other.resetAt, "2026-01-01T01:00:00.000Z");
  });

  test(`${name}: a key that merely contains another key's text is separate`, async () => {
    const { limiter } = make();
    for (let i = 0; i < 4; i += 1) await allow(limiter, "a");
    assert.equal((await allow(limiter, "a:60000")).remaining, 2);
  });

  test(`${name}: invalid limit, windowMs and key give validation errors`, async () => {
    const { limiter } = make();
    const bad: Array<[string, Rule]> = [
      ["k", { limit: 0, windowMs: 60_000 }],
      ["k", { limit: -1, windowMs: 60_000 }],
      ["k", { limit: 1.5, windowMs: 60_000 }],
      ["k", { limit: Number.NaN, windowMs: 60_000 }],
      ["k", { limit: 1, windowMs: 999 }],
      ["k", { limit: 1, windowMs: 1000.5 }],
      ["", RULE],
      ["x".repeat(201), RULE],
    ];
    for (const [key, rule] of bad) {
      const res = await limiter.check(key, rule);
      assert.equal(res.ok, false, `${key.length} ${JSON.stringify(rule)}`);
      assert.equal(!res.ok && res.error.kind, "validation");
    }
    // Boundaries that are valid.
    assert.equal((await limiter.check("x".repeat(200), { limit: 1, windowMs: 1000 })).ok, true);
  });

  test(`${name}: a rejected input is not counted`, async () => {
    const { limiter } = make();
    await limiter.check("k", { limit: 0, windowMs: 60_000 });
    assert.equal((await allow(limiter, "k")).remaining, 2);
  });

  test(`${name}: 50 concurrent checks with limit 10 allow exactly 10`, async () => {
    const { limiter } = make();
    const results = await Promise.all(
      Array.from({ length: 50 }, () => limiter.check("burst", { limit: 10, windowMs: 60_000 })),
    );
    assert.ok(results.every((r) => r.ok));
    const allowed = results.filter((r) => r.ok && r.value.allowed).length;
    assert.equal(allowed, 10);
  });

  test(`${name}: concurrent checks on different keys do not block each other's counts`, async () => {
    const { limiter } = make();
    const rule = { limit: 5, windowMs: 60_000 };
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => limiter.check(i % 2 === 0 ? "even" : "odd", rule)),
    );
    assert.equal(results.filter((r) => r.ok && r.value.allowed).length, 10);
  });
}
