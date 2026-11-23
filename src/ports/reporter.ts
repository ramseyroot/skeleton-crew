// ErrorReporter port: sends unexpected failures to an error-tracking service (requirement 12).
//
// Semantics:
// - `report()` is synchronous, returns nothing and never throws. Telemetry must not fail a step or a strip.
// - The runner reports once per strip run, when the final error is `internal` and of kind unexpected, upstream or
//   network (`shouldReport`). User errors and expected outcomes (not_found, conflict, validation, ...) are only logged.
// - The profile decides the adapter. Outside prod it is `none` or `memory` (profile gating, requirement 14).
//
// Adapters: none (drops reports), memory (keeps them for tests), log (one Logger entry, so redaction applies).
// Planned adapters (not built): a hosted error-tracking service (Sentry or similar).

import type { StepError } from "../lib/result.ts";

export type ReportContext = { strip: string; stripId: string; env: string };

export interface ErrorReporter {
  report(error: StepError, context: ReportContext): void;
}

const REPORTED_KINDS: ReadonlySet<string> = new Set(["unexpected", "upstream", "network"]);

/** True for internal errors of a kind that means something is broken, not that a user or a record was wrong. */
export function shouldReport(error: StepError): boolean {
  return error.audience === "internal" && REPORTED_KINDS.has(error.kind);
}
