import assert from "node:assert/strict";
import { test } from "node:test";
import { runMetricsContract } from "../contract.test.ts";
import { errorMap } from "./errors.ts";
import { createMemoryMetrics } from "./index.ts";

runMetricsContract("metrics/memory", () => {
  const metrics = createMemoryMetrics();
  return { metrics, observed: () => metrics.points.map((p) => ({ ...p })) };
});

test("metrics/memory: clear empties the list", () => {
  const metrics = createMemoryMetrics();
  metrics.increment("strip.runs");
  metrics.clear();
  assert.equal(metrics.points.length, 0);
});

test("metrics/memory: unmapped failures are unexpected", () => {
  assert.equal(errorMap.map(new Error("x")), "unexpected");
});
