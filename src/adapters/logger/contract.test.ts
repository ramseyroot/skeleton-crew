// Contract suite for the Logger port. Each adapter's test file calls runLoggerContract with a factory that
// returns the logger and a way to read back what it wrote.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createFixedClock } from "../clock/fixed/index.ts";
import type { LogEntry, LogInput, Logger } from "../../ports/logger.ts";

export type LoggerHarness = { logger: Logger; written: () => LogEntry[] };
export type MakeLogger = (env: string, clock: ReturnType<typeof createFixedClock>) => LoggerHarness;

const START: LogInput = {
  stripId: "s1",
  step: "db.user.findById",
  class: "db",
  phase: "start",
  source: "user",
  input: { email: "ada@example.com" },
};
const END: LogInput = {
  stripId: "s1",
  step: "db.user.findById",
  class: "db",
  phase: "end",
  ok: false,
  ms: 4,
  output: { secret: "row" },
  message: "free text with data",
  error: { kind: "not_found", audience: "internal", message: "no row for ada@example.com" },
};

export function runLoggerContract(name: string, make: MakeLogger): void {
  test(`${name}: entries carry env, the clock time, and the strip and step`, () => {
    const clock = createFixedClock("2026-11-23T12:00:00.000Z");
    const { logger, written } = make("local", clock);
    logger.log(START);
    const [entry] = written();
    assert.equal(entry?.env, "local");
    assert.equal(entry?.at, "2026-11-23T12:00:00.000Z");
    assert.equal(entry?.stripId, "s1");
    assert.equal(entry?.step, "db.user.findById");
    assert.equal(entry?.phase, "start");
  });

  test(`${name}: local and dev keep payloads`, () => {
    for (const env of ["local", "dev"]) {
      const { logger, written } = make(env, createFixedClock());
      logger.log(START);
      logger.log(END);
      const [start, end] = written();
      assert.deepEqual(start?.input, { email: "ada@example.com" });
      assert.deepEqual(end?.output, { secret: "row" });
      assert.equal(end?.message, "free text with data");
      assert.equal(end?.error?.message, "no row for ada@example.com");
    }
  });

  test(`${name}: prod removes payloads and free text and keeps the error kind`, () => {
    const { logger, written } = make("prod", createFixedClock());
    logger.log(START);
    logger.log(END);
    const [start, end] = written();
    assert.equal(start?.input, undefined);
    assert.equal(end?.output, undefined);
    assert.equal(end?.message, undefined);
    assert.deepEqual(end?.error, { kind: "not_found", audience: "internal" });
    assert.equal(end?.ms, 4);
    assert.equal(end?.step, "db.user.findById");
  });

  test(`${name}: an environment name it does not know is redacted`, () => {
    const { logger, written } = make("staging", createFixedClock());
    logger.log(START);
    assert.equal(written()[0]?.input, undefined);
  });

  test(`${name}: order is kept`, () => {
    const { logger, written } = make("local", createFixedClock());
    logger.log(START);
    logger.log(END);
    assert.deepEqual(
      written().map((e) => e.phase),
      ["start", "end"],
    );
  });

  test(`${name}: a payload that cannot be serialized does not throw`, () => {
    const { logger, written } = make("local", createFixedClock());
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    assert.doesNotThrow(() => logger.log({ ...START, input: loop, output: 10n }));
    assert.equal(written().length, 1);
  });
}
