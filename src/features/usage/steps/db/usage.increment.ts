import { err, ok } from "../../../../lib/result.ts";
import { defineStep } from "../../../../lib/step.ts";
import { monthOf, RecordRequestSchema } from "../../domain.ts";
import { z } from "zod";
import { serialized } from "../../serial.ts";

const FIELD = { ok: "ok", client_error: "clientError", server_error: "serverError" } as const;

/** Counts one request: adds one to the row of this key, endpoint and day, creating the row on the first request. */
export const incrementUsage = defineStep({
  name: "db.usage.increment",
  class: "db",
  input: RecordRequestSchema,
  output: z.object({ counterKey: z.string(), total: z.number().int() }),
  permissions: { reads: ["usage_counters"], writes: ["usage_counters"], storage: [] },
  errors: ["network", "unexpected"],
  uses: ["database", "clock"],
  run: (input, ctx) => {
    const day = ctx.clock.now().slice(0, 10);
    const counterKey = `${input.subject}:${input.endpoint}:${day}`;
    const field = FIELD[input.outcome];
    return serialized(counterKey, async () => {
      const found = await ctx.database.read("usage_counters").findBy("counterKey", counterKey);
      if (!found.ok) return err(found.error);
      const row = found.value[0];
      if (!row) {
        const counts = { ok: 0, clientError: 0, serverError: 0, [field]: 1 };
        const created = await ctx.database.write("usage_counters").create({
          id: counterKey,
          counterKey,
          monthKey: `${input.accountId}:${monthOf(day)}`,
          accountId: input.accountId,
          endpoint: input.endpoint,
          day,
          ...counts,
        });
        if (!created.ok) return err(created.error);
        return ok({ counterKey, total: 1 });
      }
      const next = Number(row[field]) + 1;
      const updated = await ctx.database.write("usage_counters").update(row.id, { [field]: next });
      if (!updated.ok) return err(updated.error);
      return ok({ counterKey, total: Number(updated.value.ok) + Number(updated.value.clientError) + Number(updated.value.serverError) });
    });
  },
});
