// Adapters do not know which step or strip run is calling them, so they build errors with this helper.
// The step wrapper (lib/step.ts) replaces `step` and `stripId` with the real ones before the error leaves the step.

import { makeError } from "./result.ts";
import type { ErrorKind, ErrorOptions, StepError } from "./result.ts";

export const PORT_STEP_PREFIX = "adapter:";

/** `adapter` is "<port>/<provider>", for example "database/sqlite". */
export function portError(kind: ErrorKind, adapter: string, message: string, options: ErrorOptions = {}): StepError {
  return makeError(kind, `${PORT_STEP_PREFIX}${adapter}`, "", message, options);
}

export function isPortError(error: StepError): boolean {
  return error.step.startsWith(PORT_STEP_PREFIX);
}
