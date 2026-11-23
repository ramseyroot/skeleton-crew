import type { Logger } from "../../../ports/logger.ts";
import { cleanTags, isMetricName, isValidTiming } from "../../../ports/metrics.ts";
import type { MetricTags, Metrics } from "../../../ports/metrics.ts";

/**
 * Writes each point as one Logger entry. The point travels in `data`, which redaction keeps in every environment.
 * `data` holds the metric name, its type and value, and the cleaned tags, and nothing else.
 */
export function createLogMetrics(deps: { logger: Logger }): Metrics {
  const emit = (type: "increment" | "timing", name: string, value: number, tags: MetricTags): void => {
    deps.logger.log({
      stripId: "",
      step: name,
      class: "metrics",
      phase: "debug",
      data: { metric: name, type, value, ...tags },
    });
  };
  return {
    increment(name, tags) {
      try {
        if (isMetricName(name)) emit("increment", name, 1, cleanTags(tags));
      } catch {
        // Telemetry never fails its caller.
      }
    },
    timing(name, ms, tags) {
      try {
        if (isMetricName(name) && isValidTiming(ms)) emit("timing", name, ms, cleanTags(tags));
      } catch {
        // Telemetry never fails its caller.
      }
    },
  };
}
