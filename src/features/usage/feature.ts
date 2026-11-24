import { defineFeature } from "../../lib/feature.ts";
import { err, ok } from "../../lib/result.ts";
import { runStrip } from "../../lib/strip.ts";
import { collections } from "./domain.ts";
import { month } from "./strips/usage.month.strip.ts";
import { record } from "./strips/usage.record.strip.ts";

/** What the usage feature tells the app: its collection. Usage comes from real requests, so there is no demo data. */
export const usageFeature = defineFeature({
  name: "usage",
  collections,
  api: {
    // The quota counts every request that reached the pipeline, whatever its outcome, the same rows the usage page shows.
    usedThisMonth: async (accountId, ports) => {
      const used = await runStrip(month, ports, { principal: { kind: "user", accountId, role: "user" } });
      return used.ok ? ok(used.value.total) : err(used.error);
    },
    record: async (entry, ports) => {
      const counted = await runStrip(record, ports, entry);
      return counted.ok ? ok(undefined) : err(counted.error);
    },
  },
});
