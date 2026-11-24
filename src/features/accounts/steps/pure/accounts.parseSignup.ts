import { z } from "zod";
import { validateCredentials } from "../../../../ports/auth.ts";
import { err, makeError } from "../../../../lib/result.ts";
import { defineStep } from "../../../../lib/step.ts";
import { CredentialsSchema } from "../../domain.ts";

/** Trims the email and checks the sign-up rules. The password is never trimmed or changed. */
export const parseSignup = defineStep({
  name: "pure.accounts.parseSignup",
  class: "pure",
  input: z.object({ email: z.string(), password: z.string() }),
  output: CredentialsSchema,
  permissions: { reads: [], writes: [], storage: [] },
  errors: ["validation"],
  sensitive: true,
  run: (input, ctx) => {
    const email = input.email.trim();
    const checked = validateCredentials(email, input.password);
    if (!checked.ok) {
      return err(
        makeError("validation", "pure.accounts.parseSignup", ctx.stripId, "sign-up form rejected", {
          audience: "user",
          userMessage: checked.userMessage,
        }),
      );
    }
    return { email, password: input.password };
  },
});
