import type { Logger } from "../../../ports/logger.ts";
import type { ErrorReporter } from "../../../ports/reporter.ts";

/**
 * Writes each report as one Logger entry. The Logger redacts it by environment, so in prod the message text is
 * dropped and the kind, step, strip and reference stay. Production log collection then acts as the error feed
 * until an app adds a hosted adapter.
 */
export function createLogReporter(deps: { logger: Logger }): ErrorReporter {
  return {
    report(error, context) {
      try {
        deps.logger.log({
          stripId: context.stripId,
          step: error.step,
          class: "reporter",
          phase: "end",
          ok: false,
          error: { kind: error.kind, audience: error.audience, message: error.message },
          message: "error reported",
          data: { strip: context.strip, reported: true },
        });
      } catch {
        // Telemetry never fails its caller.
      }
    },
  };
}
