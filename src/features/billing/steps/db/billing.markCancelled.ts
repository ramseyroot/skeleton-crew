import { z } from "zod";
import { err, makeError, ok } from "../../../../lib/result.ts";
import { defineStep } from "../../../../lib/step.ts";
import { CancelTargetSchema } from "../../domain.ts";

/** Records the cancellation. From the next request the account is on the free plan. */
export const markCancelled = defineStep({
  name: "db.billing.markCancelled",
  class: "db",
  input: CancelTargetSchema,
  output: z.object({ accountId: z.string(), status: z.literal("cancelled") }),
  permissions: { reads: ["subscriptions"], writes: ["subscriptions"], storage: [] },
  errors: ["not_found", "network", "unexpected"],
  uses: ["database"],
  run: async (input, ctx) => {
    const found = await ctx.database.read("subscriptions").findBy("accountId", input.accountId);
    if (!found.ok) return err(found.error);
    const row = found.value[0];
    if (!row) return err(makeError("not_found", "db.billing.markCancelled", ctx.stripId, `no subscription for ${input.accountId}`));
    const updated = await ctx.database.write("subscriptions").update(row.id, { status: "cancelled" });
    if (!updated.ok) return err(updated.error);
    return ok({ accountId: input.accountId, status: "cancelled" as const });
  },
});
