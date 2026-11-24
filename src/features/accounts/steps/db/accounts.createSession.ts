import { z } from "zod";
import { defineStep } from "../../../../lib/step.ts";
import { SessionSchema } from "../../domain.ts";

/** Starts a session. The token comes back once and only its hash is stored. */
export const createAccountSession = defineStep({
  name: "db.accounts.createSession",
  class: "db",
  input: z.object({ accountId: z.string().min(1) }),
  output: SessionSchema,
  permissions: { reads: ["accounts"], writes: ["sessions"], storage: [] },
  errors: ["not_found", "network", "unexpected"],
  uses: ["auth"],
  sensitive: true,
  run: (input, ctx) => ctx.auth.createSession(input.accountId),
});
