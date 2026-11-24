import { defineStep } from "../../../../lib/step.ts";
import { AccountSchema, CredentialsSchema } from "../../domain.ts";

/** Checks an email and password. A wrong password and an unknown email give the same error. */
export const verifyAccountPassword = defineStep({
  name: "db.accounts.verifyPassword",
  class: "db",
  input: CredentialsSchema,
  output: AccountSchema,
  permissions: { reads: ["accounts"], writes: [], storage: [] },
  errors: ["unauthorized", "network", "unexpected"],
  uses: ["auth"],
  sensitive: true,
  run: (input, ctx) => ctx.auth.verifyPassword(input.email, input.password),
});
