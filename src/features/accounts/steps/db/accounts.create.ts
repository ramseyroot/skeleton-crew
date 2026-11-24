import { z } from "zod";
import { defineStep } from "../../../../lib/step.ts";
import { AccountSchema, CredentialsSchema } from "../../domain.ts";

/** Creates an account with the role "user". The role is not an input, so a sign-up form cannot ask for admin. */
export const createAccount = defineStep({
  name: "db.accounts.create",
  class: "db",
  input: CredentialsSchema,
  output: AccountSchema,
  permissions: { reads: [], writes: ["accounts"], storage: [] },
  errors: ["conflict", "network", "unexpected"],
  uses: ["auth"],
  sensitive: true,
  run: (input, ctx) => ctx.auth.createAccount({ email: input.email, password: input.password, role: "user" }),
});
