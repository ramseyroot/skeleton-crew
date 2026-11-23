import assert from "node:assert/strict";
import { test } from "node:test";
import { makeError } from "../../../lib/result.ts";
import { createFixedClock } from "../../clock/fixed/index.ts";
import { createMemoryLogger } from "../../logger/memory/index.ts";
import { runReporterContract } from "../contract.test.ts";
import { errorMap } from "./errors.ts";
import { createLogReporter } from "./index.ts";

runReporterContract(
  "reporter/log",
  (env) => {
    const logger = createMemoryLogger({ env, clock: createFixedClock() });
    return {
      reporter: createLogReporter({ logger }),
      observed: () =>
        logger.entries.map((e) => ({
          kind: e.error?.kind ?? "",
          step: e.step,
          stripId: e.stripId,
          strip: String(e.data?.strip ?? ""),
          message: e.error?.message,
        })),
    };
  },
  { redactsInProd: true },
);

test("reporter/log: the entry is marked as a report and carries the environment", () => {
  const logger = createMemoryLogger({ env: "prod", clock: createFixedClock("2026-11-23T12:00:00.000Z") });
  createLogReporter({ logger }).report(makeError("network", "api.pay.charge", "strip-3", "timeout"), {
    strip: "pay.charge",
    stripId: "strip-3",
    env: "prod",
  });
  const [entry] = logger.entries;
  assert.equal(entry?.class, "reporter");
  assert.equal(entry?.env, "prod");
  assert.equal(entry?.at, "2026-11-23T12:00:00.000Z");
  assert.deepEqual(entry?.data, { strip: "pay.charge", reported: true });
});

test("reporter/log: a logger that throws does not make the report throw", () => {
  const reporter = createLogReporter({ logger: { log: () => { throw new Error("log down"); } } });
  assert.doesNotThrow(() => reporter.report(makeError("network", "a.b.c", "s", "m"), { strip: "x.y", stripId: "s", env: "prod" }));
});

test("reporter/log: unmapped failures are unexpected", () => {
  assert.equal(errorMap.map(new Error("x")), "unexpected");
});
