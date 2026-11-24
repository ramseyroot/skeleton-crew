import { defineStrip } from "../../../lib/strip.ts";
import { createKey } from "../steps/db/keys.create.ts";
import { parseKeyCreate } from "../steps/pure/keys.parseCreate.ts";

/**
 * keys.create: a signed-in user creates an API key.
 *
 * Trigger:     the keys page form (Server Action), input `{ principal, name, expiresInDays }`.
 * End states:  success   -> `{ id, name, prefix, key, createdAt, expiresAt }`. `key` is the only copy and is shown once.
 *              user error -> a toast: a missing or long name, an expiry out of range, or not signed in.
 *              internal   -> a generic message with the stripId as a reference.
 * Side effects: one write to `api_keys` (the hash and the prefix, never the key).
 * Sensitive:   the key is never logged or reported.
 */
export const createApiKey = defineStrip({
  name: "keys.create",
  budget: { reads: [], writes: ["api_keys"], storage: [] },
  steps: [parseKeyCreate, createKey],
  invalidates: [],
  routing: {
    "pure.keys.parseCreate": { validation: "toast", unauthorized: "toast" },
    "db.keys.create": { unauthorized: "toast", network: "retry:2" },
    "*": "abort",
  },
});
