import assert from "node:assert/strict";
import { test } from "node:test";
import { createFixedClock } from "../../clock/fixed/index.ts";
import { createMemoryLogger } from "../../logger/memory/index.ts";
import { runMetricsContract } from "../contract.test.ts";
import { errorMap } from "./errors.ts";
import { createLogMetrics } from "./index.ts";

runMetricsContract("metrics/log", (env) => {
  const logger = createMemoryLogger({ env, clock: createFixedClock() });
  return {
    metrics: createLogMetrics({ logger }),
    observed: () =>
      logger.entries.map((e) => {
        const { metric, type, value, ...tags } = e.data ?? {};
        return { type: String(type), name: String(metric), value: Number(value), tags };
      }),
  };
});

test("metrics/log: a point is one entry of class metrics, named after the metric", () => {
  const logger = createMemoryLogger({ env: "prod", clock: createFixedClock() });
  createLogMetrics({ logger }).timing("strip.duration_ms", 4, { strip: "profile.save", outcome: "ok" });
  const [entry] = logger.entries;
  assert.equal(entry?.class, "metrics");
  assert.equal(entry?.step, "strip.duration_ms");
  assert.equal(entry?.env, "prod");
});

test("metrics/log: a logger that throws does not make the metric throw", () => {
  const metrics = createLogMetrics({ logger: { log: () => { throw new Error("log down"); } } });
  assert.doesNotThrow(() => metrics.increment("strip.runs"));
});

test("metrics/log: unmapped failures are unexpected", () => {
  assert.equal(errorMap.map(new Error("x")), "unexpected");
});
