import { defineStrip } from "../../../lib/strip.ts";
import { verifyAccountPassword } from "../steps/db/accounts.verifyPassword.ts";
import { parseLogin } from "../steps/pure/accounts.parseLogin.ts";

/**
 * accounts.login: a visitor proves who they are with an email and a password.
 *
 * Trigger:     the login form is submitted (Server Action), input `{ email, password }`.
 * End states:  success   -> the account.
 *              user error -> a toast: an empty field, or "Email or password is wrong." (the same text for an unknown email).
 *              internal   -> a generic message with the stripId as a reference.
 * Side effects: none. A session is started by `accounts.start`.
 * Sensitive:   the password is never logged or reported.
 */
export const login = defineStrip({
  name: "accounts.login",
  budget: { reads: ["accounts"], writes: [], storage: [] },
  steps: [parseLogin, verifyAccountPassword],
  invalidates: [],
  routing: {
    "pure.accounts.parseLogin": { validation: "toast" },
    "db.accounts.verifyPassword": { unauthorized: "toast", network: "retry:2" },
    "*": "abort",
  },
});
