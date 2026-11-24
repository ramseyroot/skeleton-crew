import { defineStrip } from "../../../lib/strip.ts";
import { verifyKey } from "../steps/db/keys.verify.ts";
import { touchKey } from "../steps/db/keys.touch.ts";

/**
 * keys.verify: check an API key presented with a request.
 *
 * Trigger:     the API pipeline, for every request that carries a key, input `{ key }`.
 * End states:  success      -> `{ keyId, accountId, role }`.
 *              unauthorized -> the pipeline answers 401 with one message for every kind of bad key.
 *              internal     -> a generic message with the stripId as a reference.
 * Side effects: records the last use. A failure to record it is logged and does not fail the request.
 * Sensitive:   the key is never logged or reported.
 */
export const verifyApiKey = defineStrip({
  name: "keys.verify",
  budget: { reads: ["api_keys", "accounts"], writes: ["api_keys"], storage: [] },
  steps: [verifyKey, touchKey],
  invalidates: [],
  routing: {
    "db.keys.verify": { network: "retry:2" },
    "db.keys.touch": "log-and-continue",
    "*": "abort",
  },
});
