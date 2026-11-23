import type { Clock } from "../../../ports/clock.ts";
import { redact } from "../../../ports/logger.ts";
import type { LogEntry, LogInput, Logger } from "../../../ports/logger.ts";

export type MemoryLogger = Logger & {
  /** Entries as an output adapter would have written them (redacted outside local and dev). */
  readonly entries: readonly LogEntry[];
  clear(): void;
};

export function createMemoryLogger(options: { env: string; clock: Clock }): MemoryLogger {
  const entries: LogEntry[] = [];
  return {
    entries,
    log(input: LogInput): void {
      try {
        entries.push(redact({ ...input, env: options.env, at: options.clock.now() }));
      } catch {
        // A logger must never fail a step.
      }
    },
    clear(): void {
      entries.length = 0;
    },
  };
}
