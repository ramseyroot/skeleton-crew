import { defineFeature } from "../../lib/feature.ts";
import { err, ok } from "../../lib/result.ts";
import { runStrip } from "../../lib/strip.ts";
import { SEED_PLANS, collections } from "./domain.ts";
import { plan } from "./strips/billing.plan.strip.ts";

/**
 * What the billing feature tells the app: its collections and the plans `free` and `pro` (design G5).
 * `seed` creates a plan only when it is missing, so it is safe to run twice, and it never changes a plan the
 * builder edited. The app does not call it in prod: a prod database gets its plans by an operator's decision.
 */
export const billingFeature = defineFeature({
  name: "billing",
  collections,
  api: {
    limitsFor: async (accountId, ports) => {
      const current = await runStrip(plan, ports, { principal: { kind: "user", accountId, role: "user" } });
      if (!current.ok) return err(current.error);
      const p = current.value.plan;
      return ok({ perMinute: p.perMinute, perMonth: p.perMonth, features: p.features });
    },
  },
  seed: async (ports) => {
    for (const p of SEED_PLANS) {
      const existing = await ports.database.read("plans").get(p.id);
      if (!existing.ok) return err(existing.error);
      if (existing.value !== null) continue;
      const created = await ports.database.write("plans").create({
        id: p.id,
        name: p.name,
        priceMinor: p.priceMinor,
        currency: p.currency,
        perMinute: p.perMinute,
        perMonth: p.perMonth,
        features: JSON.stringify(p.features),
      });
      if (!created.ok) return err(created.error);
    }
    return ok(undefined);
  },
});
