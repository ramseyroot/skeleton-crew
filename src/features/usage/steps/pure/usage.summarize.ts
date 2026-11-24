import { ok } from "../../../../lib/result.ts";
import { defineStep } from "../../../../lib/step.ts";
import { MonthRowsSchema, UsageMonthSchema } from "../../domain.ts";

/** Adds the daily rows up per endpoint. Endpoints are sorted by name, so the page does not jump around. */
export const summarizeUsage = defineStep({
  name: "pure.usage.summarize",
  class: "pure",
  input: MonthRowsSchema,
  output: UsageMonthSchema,
  permissions: { reads: [], writes: [], storage: [] },
  errors: [],
  run: (input) => {
    const by = new Map<string, { endpoint: string; ok: number; clientError: number; serverError: number; total: number }>();
    for (const r of input.rows) {
      const e = by.get(r.endpoint) ?? { endpoint: r.endpoint, ok: 0, clientError: 0, serverError: 0, total: 0 };
      e.ok += r.ok;
      e.clientError += r.clientError;
      e.serverError += r.serverError;
      e.total += r.ok + r.clientError + r.serverError;
      by.set(r.endpoint, e);
    }
    const byEndpoint = [...by.values()].sort((a, b) => (a.endpoint < b.endpoint ? -1 : a.endpoint > b.endpoint ? 1 : 0));
    return ok({ month: input.month, total: byEndpoint.reduce((n, e) => n + e.total, 0), byEndpoint });
  },
});
