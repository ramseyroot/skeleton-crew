import assert from "node:assert/strict";
import { test } from "node:test";
import { makeError } from "../../../lib/result.ts";
import { runReporterContract } from "../contract.test.ts";
import { errorMap } from "./errors.ts";
import { createMemoryReporter } from "./index.ts";

runReporterContract("reporter/memory", () => {
  const reporter = createMemoryReporter();
  return {
    reporter,
    observed: () =>
      reporter.reports.map(({ error, context }) => ({ kind: error.kind, step: error.step, stripId: context.stripId, strip: context.strip, message: error.message })),
  };
});

test("reporter/memory: clear empties the list", () => {
  const reporter = createMemoryReporter();
  reporter.report(makeError("unexpected", "a.b.c", "s", "m"), { strip: "x.y", stripId: "s", env: "local" });
  assert.equal(reporter.reports.length, 1);
  reporter.clear();
  assert.equal(reporter.reports.length, 0);
});

test("reporter/memory: unmapped failures are unexpected", () => {
  assert.equal(errorMap.map(new Error("x")), "unexpected");
});
