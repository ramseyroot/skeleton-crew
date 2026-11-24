import { defineStrip } from "../../../lib/strip.ts";
import { endAccountSession } from "../steps/db/accounts.endSession.ts";

/**
 * accounts.logout: a signed-in user ends their session.
 *
 * Trigger:     the log out button (Server Action), input `{ token }`.
 * End states:  success   -> `{ ended: true }`, also for a token that was already unknown.
 *              internal   -> a generic message with the stripId as a reference.
 * Side effects: deletes one session.
 * Sensitive:   the token is never logged or reported.
 */
export const logout = defineStrip({
  name: "accounts.logout",
  budget: { reads: [], writes: ["sessions"], storage: [] },
  steps: [endAccountSession],
  invalidates: [],
  routing: {
    "db.accounts.endSession": { network: "retry:2" },
    "*": "abort",
  },
});
