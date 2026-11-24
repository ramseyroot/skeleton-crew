import { err, ok } from "../../../../lib/result.ts";
import { defineStep } from "../../../../lib/step.ts";
import { PaymentEventSchema, RecordedEventSchema } from "../../domain.ts";

/**
 * Stores the provider's event id. `duplicate` is true only when the same event was already applied. An event that
 * was stored but not applied (the earlier attempt failed) is handled again, so a retry is never lost.
 */
export const recordEvent = defineStep({
  name: "db.billing.recordEvent",
  class: "db",
  input: PaymentEventSchema,
  output: RecordedEventSchema,
  permissions: { reads: ["payment_events"], writes: ["payment_events"], storage: [] },
  errors: ["network", "unexpected"],
  uses: ["database"],
  run: async (input, ctx) => {
    const created = await ctx.database.write("payment_events").create({ id: input.id, eventId: input.id, state: "received" });
    if (created.ok) return ok({ event: input, duplicate: false });
    if (created.error.kind !== "conflict") return err(created.error);
    const existing = await ctx.database.read("payment_events").get(input.id);
    if (!existing.ok) return err(existing.error);
    return ok({ event: input, duplicate: existing.value?.state === "applied" });
  },
});
