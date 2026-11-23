import assert from "node:assert/strict";
import { test } from "node:test";
import { runClockContract } from "../contract.test.ts";
import { errorMap } from "./errors.ts";
import { createSystemClock } from "./index.ts";

runClockContract("clock/system", createSystemClock);

test("clock/system: it follows the real time", () => {
  const before = Date.now();
  const t = Date.parse(createSystemClock().now());
  assert.ok(t >= before && t <= Date.now() + 1000);
});

test("clock/system: unmapped failures are unexpected", () => {
  assert.equal(errorMap.map(new Error("x")), "unexpected");
});
