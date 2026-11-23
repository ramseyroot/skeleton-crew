import type { ErrorReporter } from "../../../ports/reporter.ts";

/** Drops every report. The profile uses it in local and dev, so development sends nothing anywhere. */
export function createNoneReporter(): ErrorReporter {
  return { report: () => {} };
}
