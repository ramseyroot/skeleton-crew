import { defineStrip } from "../../../lib/strip.ts";
import { revokeKey } from "../steps/db/keys.revoke.ts";

/**
 * keys.revoke: the owner (or an admin) revokes a key.
 *
 * Trigger:     the revoke button on the keys page (Server Action), input `{ principal, keyId }`.
 * End states:  success   -> `{ id, revokedAt }`, also for a key that was already revoked.
 *              user error -> a toast: not signed in, or the key belongs to someone else.
 *              internal   -> a generic message with the stripId as a reference: an unknown key.
 * Side effects: one write to `api_keys`.
 */
export const revokeApiKey = defineStrip({
  name: "keys.revoke",
  budget: { reads: ["api_keys"], writes: ["api_keys"], storage: [] },
  steps: [revokeKey],
  invalidates: [],
  routing: {
    "db.keys.revoke": { unauthorized: "toast", forbidden: "toast", network: "retry:2" },
    "*": "abort",
  },
});
