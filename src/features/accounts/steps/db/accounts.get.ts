import { z } from "zod";
import { defineStep } from "../../../../lib/step.ts";
import { AccountSchema } from "../../domain.ts";

/** Reads one account by id. */
export const getAccount = defineStep({
  name: "db.accounts.get",
  class: "db",
  input: z.object({ accountId: z.string().min(1) }),
  output: AccountSchema,
  permissions: { reads: ["accounts"], writes: [], storage: [] },
  errors: ["not_found", "network", "unexpected"],
  uses: ["auth"],
  run: (input, ctx) => ctx.auth.getAccount(input.accountId),
});
