import { err, ok } from "../../../../lib/result.ts";
import type { Result } from "../../../../lib/result.ts";
import { defineStep } from "../../../../lib/step.ts";
import type { BatchOp } from "../../../../ports/database.ts";
import { AppliedSchema, RecordedEventSchema, toPlan } from "../../domain.ts";

type Applied = { applied: boolean; reason: string };

/**
 * Applies a verified event to the account's subscription, and marks the event applied in the same atomic batch.
 * A successful payment sets the plan (when the plan exists and the amount matches its price). A failed payment
 * changes nothing and is logged. A cancellation ends the subscription. A duplicate or ignored event does nothing.
 */
export const setPlan = defineStep({
  name: "db.billing.setPlan",
  class: "db",
  input: RecordedEventSchema,
  output: AppliedSchema,
  permissions: { reads: ["plans", "subscriptions"], writes: ["subscriptions", "payment_events"], storage: [] },
  errors: ["network", "unexpected"],
  uses: ["database", "ids"],
  run: async (input, ctx): Promise<Result<Applied>> => {
    const { event } = input;
    if (input.duplicate) return ok({ applied: false, reason: "duplicate" });
    const markApplied: BatchOp = { op: "update", collection: "payment_events", id: event.id, patch: { state: "applied" } };
    const finish = async (ops: BatchOp[], result: Applied): Promise<Result<Applied>> => {
      const done = await ctx.database.batch([...ops, markApplied]);
      if (!done.ok) return err(done.error);
      if (!result.applied) ctx.log.debug(`event ${event.id} changed nothing: ${result.reason}`);
      return ok(result);
    };

    if (event.type === "ignored") return finish([], { applied: false, reason: "ignored" });
    if (event.type === "payment.failed") return finish([], { applied: false, reason: "payment_failed" });

    const subs = ctx.database.read("subscriptions");
    if (event.type === "subscription.cancelled") {
      const found = await subs.findBy("reference", event.reference);
      if (!found.ok) return err(found.error);
      const sub = found.value[0];
      if (!sub) return finish([], { applied: false, reason: "unknown_subscription" });
      return finish([{ op: "update", collection: "subscriptions", id: sub.id, patch: { status: "cancelled" } }], { applied: true, reason: "cancelled" });
    }

    const plan = await ctx.database.read("plans").get(event.planId);
    if (!plan.ok) return err(plan.error);
    if (plan.value === null) return finish([], { applied: false, reason: "unknown_plan" });
    const price = toPlan(plan.value);
    if (event.money.amountMinor !== price.priceMinor || event.money.currency !== price.currency) {
      return finish([], { applied: false, reason: "amount_mismatch" });
    }
    const existing = await subs.findBy("accountId", event.accountId);
    if (!existing.ok) return err(existing.error);
    const patch = { planId: event.planId, status: "active", reference: event.reference };
    const row = existing.value[0];
    const op: BatchOp = row
      ? { op: "update", collection: "subscriptions", id: row.id, patch }
      : { op: "create", collection: "subscriptions", record: { id: ctx.ids.next(), accountId: event.accountId, ...patch } };
    return finish([op], { applied: true, reason: "plan_set" });
  },
});
