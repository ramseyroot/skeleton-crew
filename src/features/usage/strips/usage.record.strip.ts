import { defineStrip } from "../../../lib/strip.ts";
import { incrementUsage } from "../steps/db/usage.increment.ts";

/**
 * usage.record: count one request that reached the API pipeline.
 *
 * Trigger:     the API pipeline, after every response, input `{ accountId, subject, endpoint, outcome }`.
 * End states:  success  -> `{ counterKey, total }`.
 *              internal -> the pipeline logs it and answers the request as it would have. Counting never fails a request.
 * Side effects: one write to `usage_counters`: adds one to the row of this key, endpoint and day.
 */
export const record = defineStrip({
  name: "usage.record",
  budget: { reads: ["usage_counters"], writes: ["usage_counters"], storage: [] },
  steps: [incrementUsage],
  invalidates: [],
  routing: {
    "db.usage.increment": { network: "retry:2" },
    "*": "abort",
  },
});
