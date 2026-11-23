import assert from "node:assert/strict";
import { test } from "node:test";
import { makeError } from "../../../lib/result.ts";
import { reportedKindsCases, runReporterContract } from "../contract.test.ts";
import { errorMap } from "./errors.ts";
import { createNoneReporter } from "./index.ts";

runReporterContract("reporter/none", () => ({ reporter: createNoneReporter() }));
reportedKindsCases();

test("reporter/none: it keeps and sends nothing", () => {
  const reporter = createNoneReporter();
  reporter.report(makeError("unexpected", "a.b.c", "s", "m"), { strip: "x.y", stripId: "s", env: "local" });
  assert.deepEqual(Object.keys(reporter), ["report"]);
});

test("reporter/none: unmapped failures are unexpected", () => {
  assert.equal(errorMap.map(new Error("x")), "unexpected");
});
