import { defineStrip } from "../../../lib/strip.ts";
import { rotateKey } from "../steps/db/keys.rotate.ts";

/**
 * keys.rotate: the owner replaces an active key with a new one.
 *
 * Trigger:     the rotate button on the keys page (Server Action), input `{ principal, keyId }`.
 * End states:  success   -> the new key, shown once, with `replacedId`. The old key is revoked in the same write.
 *              user error -> a toast: not signed in, someone else's key, or a key that is not active.
 *              internal   -> a generic message with the stripId as a reference.
 * Side effects: one atomic batch on `api_keys`: create the new key, revoke the old one.
 * Sensitive:   the new key is never logged or reported.
 */
export const rotateApiKey = defineStrip({
  name: "keys.rotate",
  budget: { reads: ["api_keys"], writes: ["api_keys"], storage: [] },
  steps: [rotateKey],
  invalidates: [],
  routing: {
    "db.keys.rotate": { unauthorized: "toast", forbidden: "toast", conflict: "toast", network: "retry:2" },
    "*": "abort",
  },
});
