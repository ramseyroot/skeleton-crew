import { defineStrip } from "../../../lib/strip.ts";
import { listKeys } from "../steps/db/keys.list.ts";

/**
 * keys.list: a signed-in user sees their keys.
 *
 * Trigger:     the keys page renders (server component), input `{ principal }`.
 * End states:  success   -> `{ keys }`, newest first, each with prefix and state. Never the key itself.
 *              user error -> a toast: not signed in.
 *              internal   -> a generic message with the stripId as a reference.
 * Side effects: none.
 */
export const listApiKeys = defineStrip({
  name: "keys.list",
  budget: { reads: ["api_keys"], writes: [], storage: [] },
  steps: [listKeys],
  invalidates: [],
  routing: {
    "db.keys.list": { unauthorized: "toast", network: "retry:2" },
    "*": "abort",
  },
});
