import type { StepError } from "../../../lib/result.ts";
import type { ErrorReporter, ReportContext } from "../../../ports/reporter.ts";

export type MemoryReporter = ErrorReporter & {
  readonly reports: readonly { error: StepError; context: ReportContext }[];
  clear(): void;
};

export function createMemoryReporter(): MemoryReporter {
  const reports: { error: StepError; context: ReportContext }[] = [];
  return {
    reports,
    report(error, context) {
      try {
        reports.push({ error, context });
      } catch {
        // Telemetry never fails its caller.
      }
    },
    clear() {
      reports.length = 0;
    },
  };
}
