import type { Metrics } from "../../../ports/metrics.ts";

/** Drops every point. The profile uses it in local and dev. */
export function createNoneMetrics(): Metrics {
  return { increment: () => {}, timing: () => {} };
}
