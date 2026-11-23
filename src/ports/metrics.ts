// Metrics port: counts and timings per strip and step (requirement 13).
//
// Semantics:
// - Both methods are synchronous, return nothing and never throw. A bad name, tag or number is dropped, not raised.
// - Names look like `strip.duration_ms`: lowercase letters, digits, "_" and ".", starting with a letter.
// - Only the tag keys strip, step, outcome and kind are accepted (`cleanTags`), so the number of distinct series
//   stays bounded. Any other key is dropped.
// - `timing` needs a finite number of milliseconds that is zero or more.
//
// Adapters: none (drops), memory (keeps points for tests), log (one Logger entry with the point in `data`).
// Planned adapters (not built): a hosted metrics service (Cloudflare analytics or similar).

import type { ErrorKind } from "../lib/result.ts";

export type MetricTags = {
  strip?: string;
  step?: string;
  outcome?: "ok" | "error";
  kind?: ErrorKind;
};

export interface Metrics {
  increment(name: string, tags?: MetricTags): void;
  timing(name: string, ms: number, tags?: MetricTags): void;
}

const NAME = /^[a-z][a-z0-9_.]{0,63}$/;
const TAG_VALUE = /^[A-Za-z0-9_.:-]{1,64}$/;
const KIND = /^[a-z_]{1,32}$/;

export const isMetricName = (name: unknown): name is string => typeof name === "string" && NAME.test(name);

/** Keeps only the allowed tag keys with valid values. */
export function cleanTags(tags?: Record<string, unknown>): MetricTags {
  const out: MetricTags = {};
  if (tags === undefined || tags === null || typeof tags !== "object") return out;
  const { strip, step, outcome, kind } = tags;
  if (typeof strip === "string" && TAG_VALUE.test(strip)) out.strip = strip;
  if (typeof step === "string" && TAG_VALUE.test(step)) out.step = step;
  if (outcome === "ok" || outcome === "error") out.outcome = outcome;
  if (typeof kind === "string" && KIND.test(kind)) out.kind = kind as ErrorKind;
  return out;
}

export const isValidTiming = (ms: unknown): ms is number => typeof ms === "number" && Number.isFinite(ms) && ms >= 0;
