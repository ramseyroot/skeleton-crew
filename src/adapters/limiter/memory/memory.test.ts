import assert from "node:assert/strict";
import { test } from "node:test";
import { createFixedClock } from "../../clock/fixed/index.ts";
import { runLimiterContract } from "../contract.test.ts";
import { errorMap } from "./errors.ts";
import { createMemoryLimiter } from "./index.ts";

runLimiterContract("limiter/memory", () => {
  const clock = createFixedClock();
  return { limiter: createMemoryLimiter({ clock }), clock };
});

test("limiter/memory: has the adapter name", () => {
  assert.equal(createMemoryLimiter({ clock: createFixedClock() }).name, "memory");
});

test("limiter/memory: a clock that throws gives an error Result, not a throw", async () => {
  const limiter = createMemoryLimiter({
    clock: {
      now: () => {
        throw new Error("clock broke");
      },
    },
  });
  const res = await limiter.check("k", { limit: 1, windowMs: 1000 });
  assert.equal(res.ok, false);
  assert.equal(!res.ok && res.error.kind, "unexpected");
});

test("limiter/memory: unmapped failures are unexpected", () => {
  assert.equal(errorMap.map(new Error("x")), "unexpected");
});
