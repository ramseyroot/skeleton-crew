// Contract suite for the Clock port. Each adapter's test file calls runClockContract with its factory.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Clock } from "../../ports/clock.ts";

export function runClockContract(name: string, make: () => Clock): void {
  test(`${name}: now() is an ISO 8601 UTC string with milliseconds`, () => {
    const now = make().now();
    assert.match(now, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.equal(new Date(now).toISOString(), now);
  });

  test(`${name}: time never goes backwards`, () => {
    const clock = make();
    const a = Date.parse(clock.now());
    const b = Date.parse(clock.now());
    assert.ok(b >= a);
  });
}
