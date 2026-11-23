import assert from "node:assert/strict";
import { test } from "node:test";
import { helperCases, runMetricsContract } from "../contract.test.ts";
import { errorMap } from "./errors.ts";
import { createNoneMetrics } from "./index.ts";

runMetricsContract("metrics/none", () => ({ metrics: createNoneMetrics() }));
helperCases();

test("metrics/none: unmapped failures are unexpected", () => {
  assert.equal(errorMap.map(new Error("x")), "unexpected");
});
