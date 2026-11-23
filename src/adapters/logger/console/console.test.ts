import assert from "node:assert/strict";
import { test } from "node:test";
import { runLoggerContract } from "../contract.test.ts";
import type { LogEntry } from "../../../ports/logger.ts";
import { errorMap } from "./errors.ts";
import { createConsoleLogger } from "./index.ts";

runLoggerContract("logger/console (json)", (env, clock) => {
  const lines: string[] = [];
  const logger = createConsoleLogger({ env, clock, write: (l) => lines.push(l) });
  return { logger, written: () => lines.map((l) => JSON.parse(l) as LogEntry) };
});

test("logger/console: one JSON object per line", () => {
  const lines: string[] = [];
  const logger = createConsoleLogger({
    env: "dev",
    clock: { now: () => "2026-11-23T12:00:00.000Z" },
    write: (l) => lines.push(l),
  });
  logger.log({ stripId: "s", step: "a.b.c", class: "pure", phase: "end", ok: true, ms: 1 });
  assert.equal(lines.length, 1);
  assert.doesNotMatch(lines[0] ?? "", /\n/);
});

test("logger/console: pretty format is one readable line", () => {
  const lines: string[] = [];
  const logger = createConsoleLogger({
    env: "local",
    format: "pretty",
    clock: { now: () => "2026-11-23T12:00:05.123Z" },
    write: (l) => lines.push(l),
  });
  logger.log({
    stripId: "s9",
    step: "db.user.findById",
    class: "db",
    phase: "end",
    ok: false,
    ms: 7,
    error: { kind: "not_found", audience: "internal" },
  });
  assert.equal(lines[0], "12:00:05.123 [s9] db.user.findById end FAILED(not_found) 7ms");
});

test("logger/console: a failing sink does not throw", () => {
  const logger = createConsoleLogger({
    env: "local",
    clock: { now: () => "2026-11-23T12:00:00.000Z" },
    write: () => {
      throw new Error("disk full");
    },
  });
  assert.doesNotThrow(() => logger.log({ stripId: "s", step: "a.b.c", class: "pure", phase: "start" }));
});

test("logger/console: without a sink it writes through console.log", (t) => {
  const calls: unknown[] = [];
  t.mock.method(console, "log", (line: unknown) => calls.push(line));
  createConsoleLogger({ env: "dev", clock: { now: () => "2026-11-23T12:00:00.000Z" } }).log({
    stripId: "s",
    step: "a.b.c",
    class: "pure",
    phase: "start",
  });
  assert.equal(calls.length, 1);
});

test("logger/console: unmapped failures are unexpected", () => {
  assert.equal(errorMap.map(new Error("x")), "unexpected");
});
