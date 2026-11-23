// Logger port. Steps never call `console`: every line goes through this port (plan section 13).
//
// Semantics:
// - `log()` is synchronous and never throws. A logger that fails must not fail a step.
// - The adapter adds `env` (the profile name) and `at` (from the Clock), so entries cannot be
//   confused across environments.
// - Redaction happens here, before output (`redact`). Only `local` and `dev` keep payloads.
//   Any other environment name, including one the code has never heard of, is redacted.
//
// Adapters: console (JSON lines or a pretty printer; the only code that may call `console`), memory (assertable).

import type { ErrorKind } from "../lib/result.ts";

export type LogSource = "cache" | "db" | "api" | "memory" | "prev-step" | "user";

export type LogEntry = {
  env: string;
  /** ISO 8601 UTC, from the Clock. */
  at: string;
  stripId: string;
  step: string;
  class: string;
  phase: "start" | "end" | "debug";
  source?: LogSource;
  ok?: boolean;
  ms?: number;
  input?: unknown;
  output?: unknown;
  error?: { kind: ErrorKind; audience: "user" | "internal"; message?: string };
  /** Free text for `debug` entries, for example "cache entry corrupt, deleted". */
  message?: string;
};

/** What callers pass. The adapter fills `env` and `at`. */
export type LogInput = Omit<LogEntry, "env" | "at">;

export interface Logger {
  log(entry: LogInput): void;
}

const KEEP_PAYLOAD = new Set(["local", "dev"]);

/** Removes payloads and free text outside `local` and `dev`. Keeps ids, names, source, duration and error kind. */
export function redact(entry: LogEntry): LogEntry {
  if (KEEP_PAYLOAD.has(entry.env)) return entry;
  const { input: _input, output: _output, message: _message, error, ...rest } = entry;
  return error === undefined ? rest : { ...rest, error: { kind: error.kind, audience: error.audience } };
}
