import { defineStrip } from "../../../lib/strip.ts";
import { createAccountSession } from "../steps/db/accounts.createSession.ts";

/**
 * accounts.start: a session begins for an account that has just signed up or logged in.
 *
 * Trigger:     the Server Actions, after `accounts.signup` or `accounts.login` succeeded, input `{ accountId }`.
 * End states:  success   -> `{ token, expiresAt }`. The token is shown once and the action puts it in a cookie.
 *              internal   -> a generic message with the stripId as a reference.
 * Side effects: one write to `sessions`.
 * Sensitive:   the token is never logged or reported.
 */
export const start = defineStrip({
  name: "accounts.start",
  budget: { reads: ["accounts"], writes: ["sessions"], storage: [] },
  steps: [createAccountSession],
  invalidates: [],
  routing: {
    "db.accounts.createSession": { network: "retry:2" },
    "*": "abort",
  },
});
