import { cleanTags, isMetricName, isValidTiming } from "../../../ports/metrics.ts";
import type { MetricTags, Metrics } from "../../../ports/metrics.ts";

export type MetricPoint = { type: "increment" | "timing"; name: string; value: number; tags: MetricTags };

export type MemoryMetrics = Metrics & {
  readonly points: readonly MetricPoint[];
  clear(): void;
};

export function createMemoryMetrics(): MemoryMetrics {
  const points: MetricPoint[] = [];
  return {
    points,
    increment(name, tags) {
      try {
        if (isMetricName(name)) points.push({ type: "increment", name, value: 1, tags: cleanTags(tags) });
      } catch {
        // Telemetry never fails its caller.
      }
    },
    timing(name, ms, tags) {
      try {
        if (isMetricName(name) && isValidTiming(ms)) points.push({ type: "timing", name, value: ms, tags: cleanTags(tags) });
      } catch {
        // Telemetry never fails its caller.
      }
    },
    clear() {
      points.length = 0;
    },
  };
}
