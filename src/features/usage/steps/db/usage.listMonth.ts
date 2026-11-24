import { z } from "zod";
import { requireSignedIn } from "../../../../lib/authz.ts";
import { err, ok } from "../../../../lib/result.ts";
import { defineStep } from "../../../../lib/step.ts";
import { MonthRowsSchema, monthOf, PrincipalSchema } from "../../domain.ts";

/** The caller's counter rows for the current month (UTC), the same rows the monthly quota adds up. */
export const listMonthUsage = defineStep({
  name: "db.usage.listMonth",
  class: "db",
  input: z.object({ principal: PrincipalSchema }),
  output: MonthRowsSchema,
  permissions: { reads: ["usage_counters"], writes: [], storage: [] },
  errors: ["unauthorized", "network", "unexpected"],
  uses: ["database", "clock"],
  run: async (input, ctx) => {
    const who = requireSignedIn(input.principal, { step: "db.usage.listMonth", stripId: ctx.stripId });
    if (!who.ok) return who;
    const month = monthOf(ctx.clock.now());
    const found = await ctx.database.read("usage_counters").findBy("monthKey", `${who.value.accountId}:${month}`);
    if (!found.ok) return err(found.error);
    return ok({
      month,
      rows: found.value.map((r) => ({
        endpoint: String(r.endpoint),
        day: String(r.day),
        ok: Number(r.ok),
        clientError: Number(r.clientError),
        serverError: Number(r.serverError),
      })),
    });
  },
});
