import { defineStrip } from "../../../lib/strip.ts";
import { listMonthUsage } from "../steps/db/usage.listMonth.ts";
import { summarizeUsage } from "../steps/pure/usage.summarize.ts";

/**
 * usage.month: what the caller used this month, by endpoint.
 *
 * Trigger:     the usage page renders (server component), and the API pipeline for the monthly quota, input `{ principal }`.
 * End states:  success   -> `{ month, total, byEndpoint }`, from the same rows `usage.record` writes.
 *              user error -> a toast: not signed in.
 *              internal   -> a generic message with the stripId as a reference.
 * Side effects: none.
 */
export const month = defineStrip({
  name: "usage.month",
  budget: { reads: ["usage_counters"], writes: [], storage: [] },
  steps: [listMonthUsage, summarizeUsage],
  invalidates: [],
  routing: {
    "db.usage.listMonth": { unauthorized: "toast", network: "retry:2" },
    "*": "abort",
  },
});
