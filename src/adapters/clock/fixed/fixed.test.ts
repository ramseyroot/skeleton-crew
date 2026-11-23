import assert from "node:assert/strict";
import { test } from "node:test";
import { runClockContract } from "../contract.test.ts";
import { errorMap } from "./errors.ts";
import { createFixedClock } from "./index.ts";

runClockContract("clock/fixed", () => createFixedClock());

test("clock/fixed: time stands still until moved", () => {
  const clock = createFixedClock("2026-11-23T12:00:00.000Z");
  assert.equal(clock.now(), "2026-11-23T12:00:00.000Z");
  assert.equal(clock.now(), "2026-11-23T12:00:00.000Z");
  clock.advance(1500);
  assert.equal(clock.now(), "2026-11-23T12:00:01.500Z");
  clock.set("2027-01-01T00:00:00.000Z");
  assert.equal(clock.now(), "2027-01-01T00:00:00.000Z");
});

test("clock/fixed: a bad date is rejected", () => {
  assert.throws(() => createFixedClock("not a date"), RangeError);
  assert.throws(() => createFixedClock().set("nope"), RangeError);
});

test("clock/fixed: unmapped failures are unexpected", () => {
  assert.equal(errorMap.map(new Error("x")), "unexpected");
});
