import assert from "node:assert/strict";
import { test } from "node:test";
import { runLoggerContract } from "../contract.test.ts";
import { errorMap } from "./errors.ts";
import { createMemoryLogger } from "./index.ts";

runLoggerContract("logger/memory", (env, clock) => {
  const logger = createMemoryLogger({ env, clock });
  return { logger, written: () => [...logger.entries] };
});

test("logger/memory: clear empties the list", () => {
  const logger = createMemoryLogger({ env: "local", clock: { now: () => "2026-11-23T12:00:00.000Z" } });
  logger.log({ stripId: "s", step: "a.b.c", class: "pure", phase: "start" });
  assert.equal(logger.entries.length, 1);
  logger.clear();
  assert.equal(logger.entries.length, 0);
});

test("logger/memory: unmapped failures are unexpected", () => {
  assert.equal(errorMap.map(new Error("x")), "unexpected");
});
