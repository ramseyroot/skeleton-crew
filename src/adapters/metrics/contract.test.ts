// Contract suite for the Metrics port. `observed` is missing for adapters that keep nothing (none).

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Metrics } from "../../ports/metrics.ts";
import { cleanTags, isMetricName, isValidTiming } from "../../ports/metrics.ts";

export type Point = { type: string; name: string; value: number; tags: Record<string, unknown> };
export type MetricsHarness = { metrics: Metrics; observed?: () => Point[] };
export type MakeMetrics = (env: string) => MetricsHarness;

export function runMetricsContract(name: string, make: MakeMetrics): void {
  test(`${name}: nothing it is given makes it throw`, () => {
    const { metrics } = make("local");
    assert.equal(metrics.increment("strip.runs", { strip: "profile.save", outcome: "ok" }), undefined);
    assert.doesNotThrow(() => metrics.increment(undefined as never));
    assert.doesNotThrow(() => metrics.increment("Bad Name!", { strip: 5 as never }));
    assert.doesNotThrow(() => metrics.timing("strip.duration_ms", Number.NaN));
    assert.doesNotThrow(() => metrics.timing("strip.duration_ms", 5, null as never));
  });

  test(`${name}: an increment is one point with value 1`, (t) => {
    const { metrics, observed } = make("local");
    if (!observed) return t.skip("this adapter keeps nothing");
    metrics.increment("strip.runs", { strip: "profile.save", outcome: "ok" });
    assert.deepEqual(observed(), [{ type: "increment", name: "strip.runs", value: 1, tags: { strip: "profile.save", outcome: "ok" } }]);
  });

  test(`${name}: a timing keeps its milliseconds, zero included, and the kind on a failure`, (t) => {
    const { metrics, observed } = make("local");
    if (!observed) return t.skip("this adapter keeps nothing");
    metrics.timing("step.duration_ms", 12.5, { step: "db.user.findProfile", outcome: "error", kind: "not_found" });
    metrics.timing("step.duration_ms", 0, { step: "db.user.findProfile", outcome: "ok" });
    assert.deepEqual(observed().map((p) => p.value), [12.5, 0]);
    assert.deepEqual(observed()[0]?.tags, { step: "db.user.findProfile", outcome: "error", kind: "not_found" });
  });

  test(`${name}: only the allowed tag keys with valid values are kept`, (t) => {
    const { metrics, observed } = make("local");
    if (!observed) return t.skip("this adapter keeps nothing");
    metrics.increment("strip.runs", { strip: "profile.save", userId: "u1", email: "a@b.c", outcome: "maybe" } as never);
    assert.deepEqual(observed()[0]?.tags, { strip: "profile.save" });
  });

  test(`${name}: a bad name or a bad number is dropped`, (t) => {
    const { metrics, observed } = make("local");
    if (!observed) return t.skip("this adapter keeps nothing");
    metrics.increment("Strip Runs");
    metrics.increment("");
    metrics.timing("strip.duration_ms", -1);
    metrics.timing("strip.duration_ms", Number.POSITIVE_INFINITY);
    metrics.timing("strip.duration_ms", "5" as never);
    assert.deepEqual(observed(), []);
  });

  test(`${name}: points arrive in order, and prod keeps them`, (t) => {
    for (const env of ["local", "prod"]) {
      const { metrics, observed } = make(env);
      if (!observed) return t.skip("this adapter keeps nothing");
      metrics.increment("strip.runs");
      metrics.timing("strip.duration_ms", 3);
      assert.deepEqual(observed().map((p) => `${p.type}:${p.name}`), ["increment:strip.runs", "timing:strip.duration_ms"], env);
    }
  });
}

export function helperCases(): void {
  test("cleanTags keeps strip, step, outcome and kind and nothing else", () => {
    assert.deepEqual(cleanTags({ strip: "a.b", step: "db.a.b", outcome: "error", kind: "conflict", extra: 1 }), {
      strip: "a.b",
      step: "db.a.b",
      outcome: "error",
      kind: "conflict",
    });
    assert.deepEqual(cleanTags(undefined), {});
    assert.deepEqual(cleanTags({ strip: "has space", kind: "Not A Kind", outcome: "ok" }), { outcome: "ok" });
    assert.deepEqual(cleanTags("x" as never), {});
  });
  test("metric names and timings are validated", () => {
    assert.equal(isMetricName("strip.duration_ms"), true);
    for (const bad of ["", "Strip", "1abc", "a b", "a-b", 5, null]) assert.equal(isMetricName(bad), false, String(bad));
    assert.equal(isValidTiming(0), true);
    for (const bad of [-0.1, Number.NaN, Number.POSITIVE_INFINITY, "1", null]) assert.equal(isValidTiming(bad), false, String(bad));
  });
}
