import { z } from "zod";
import { err, makeError } from "../../../../lib/result.ts";
import { defineStep } from "../../../../lib/step.ts";
import { CredentialsSchema } from "../../domain.ts";

/**
 * Checks that both fields are filled in. It does not apply the sign-up rules: a login form must not reveal what a
 * valid password looks like, and an old account may predate a rule.
 */
export const parseLogin = defineStep({
  name: "pure.accounts.parseLogin",
  class: "pure",
  input: z.object({ email: z.string(), password: z.string() }),
  output: CredentialsSchema,
  permissions: { reads: [], writes: [], storage: [] },
  errors: ["validation"],
  sensitive: true,
  run: (input, ctx) => {
    const email = input.email.trim();
    if (email.length === 0 || input.password.length === 0) {
      return err(
        makeError("validation", "pure.accounts.parseLogin", ctx.stripId, "login form incomplete", {
          audience: "user",
          userMessage: "Enter your email and password.",
        }),
      );
    }
    return { email, password: input.password };
  },
});
