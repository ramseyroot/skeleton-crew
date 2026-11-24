import { defineStrip } from "../../../lib/strip.ts";
import { createAccount } from "../steps/db/accounts.create.ts";
import { parseSignup } from "../steps/pure/accounts.parseSignup.ts";

/**
 * accounts.signup: a visitor creates an account.
 *
 * Trigger:     the sign-up form is submitted (Server Action), input `{ email, password }`.
 * End states:  success   -> the new account (no password, no hash).
 *              user error -> a toast: a bad email, a short password, or an email that is already used.
 *              internal   -> a generic message with the stripId as a reference.
 * Side effects: `db.accounts.create` writes one account. Nothing else. A session is started by `accounts.start`.
 * Sensitive:   the password is never logged or reported.
 */
export const signup = defineStrip({
  name: "accounts.signup",
  budget: { reads: [], writes: ["accounts"], storage: [] },
  steps: [parseSignup, createAccount],
  invalidates: [],
  routing: {
    "pure.accounts.parseSignup": { validation: "toast" },
    "db.accounts.create": { conflict: "toast", validation: "toast", network: "retry:2" },
    "*": "abort",
  },
});
