import { defineStrip } from "../../../lib/strip.ts";
import { getAccount } from "../steps/db/accounts.get.ts";

/**
 * accounts.me: the account of the caller, for the `me.get` endpoint.
 *
 * Trigger:     `GET /api/v1/me`, input `{ accountId }` taken from the authenticated principal.
 * End states:  success   -> `{ id, email, role, createdAt }`.
 *              internal   -> a generic message with the stripId as a reference (an account removed after the session began is `not_found`).
 * Side effects: none.
 */
export const me = defineStrip({
  name: "accounts.me",
  budget: { reads: ["accounts"], writes: [], storage: [] },
  steps: [getAccount],
  invalidates: [],
  routing: {
    "db.accounts.get": { network: "retry:2" },
    "*": "abort",
  },
});
