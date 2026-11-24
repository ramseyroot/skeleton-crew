import { defineStrip } from "../../../lib/strip.ts";
import { verifyAccountSession } from "../steps/db/accounts.verifySession.ts";

/**
 * accounts.whoami: find who a session token belongs to.
 *
 * Trigger:     a page or the API pipeline reads the session cookie, input `{ token }`.
 * End states:  success      -> the account.
 *              unauthorized -> the caller treats the visitor as signed out. This is not a failure to report.
 *              internal     -> a generic message with the stripId as a reference.
 * Side effects: an expired session is deleted when seen.
 * Sensitive:   the token is never logged or reported.
 */
export const whoami = defineStrip({
  name: "accounts.whoami",
  budget: { reads: ["accounts", "sessions"], writes: ["sessions"], storage: [] },
  steps: [verifyAccountSession],
  invalidates: [],
  routing: {
    "db.accounts.verifySession": { network: "retry:2" },
    "*": "abort",
  },
});
