import { z } from "zod";
import { defineStep } from "../../../../lib/step.ts";
import { AccountSchema } from "../../domain.ts";

/** Finds who a session token belongs to. An expired session is deleted when seen, so this step writes. */
export const verifyAccountSession = defineStep({
  name: "db.accounts.verifySession",
  class: "db",
  input: z.object({ token: z.string() }),
  output: AccountSchema,
  permissions: { reads: ["accounts", "sessions"], writes: ["sessions"], storage: [] },
  errors: ["unauthorized", "network", "unexpected"],
  uses: ["auth"],
  sensitive: true,
  run: (input, ctx) => ctx.auth.verifySession(input.token),
});
