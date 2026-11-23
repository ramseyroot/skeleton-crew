// The only place in the project that may call `console` (rule R01, config `loggerAdapter`).
// Cloudflare Workers and most hosts collect console output as their log stream, so one JSON line per entry is the
// production format. `pretty` is a readable single line for local work.

import type { Clock } from "../../../ports/clock.ts";
import { redact } from "../../../ports/logger.ts";
import type { LogEntry, LogInput, Logger } from "../../../ports/logger.ts";

export type ConsoleLoggerOptions = {
  env: string;
  clock: Clock;
  format?: "json" | "pretty";
  /** Where lines go. Defaults to `console.log`. Tests pass their own. */
  write?: (line: string) => void;
};

function stringify(entry: LogEntry): string {
  const replacer = (_key: string, value: unknown): unknown => (typeof value === "bigint" ? value.toString() : value);
  try {
    return JSON.stringify(entry, replacer);
  } catch {
    // Circular or otherwise unserializable payload: keep the line, drop the payload.
    const { input: _input, output: _output, ...rest } = entry;
    return JSON.stringify({ ...rest, message: rest.message ?? "payload could not be serialized" }, replacer);
  }
}

function pretty(entry: LogEntry): string {
  const time = entry.at.slice(11, 23);
  const status = entry.ok === undefined ? "" : entry.ok ? " ok" : ` FAILED(${entry.error?.kind ?? "?"})`;
  const ms = entry.ms === undefined ? "" : ` ${entry.ms}ms`;
  const source = entry.source === undefined ? "" : ` from ${entry.source}`;
  const note = entry.message === undefined ? "" : ` ${entry.message}`;
  return `${time} [${entry.stripId}] ${entry.step} ${entry.phase}${status}${ms}${source}${note}`;
}

export function createConsoleLogger(options: ConsoleLoggerOptions): Logger {
  const write = options.write ?? ((line: string) => console.log(line));
  const format = options.format ?? "json";
  return {
    log(input: LogInput): void {
      try {
        const entry = redact({ ...input, env: options.env, at: options.clock.now() });
        write(format === "pretty" ? pretty(entry) : stringify(entry));
      } catch {
        // A logger must never fail a step.
      }
    },
  };
}
