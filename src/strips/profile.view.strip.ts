import { defineStrip } from "../lib/strip.ts";
import { readCachedProfile } from "../steps/cache/profile.read.ts";
import { writeCachedProfile } from "../steps/cache/profile.write.ts";
import { findUserProfile } from "../steps/db/user.findProfile.ts";

/**
 * profile.view: show a user's profile, using the cache when it can.
 *
 * Trigger:     the profile page renders (server component), input `{ userId }`.
 * End states:  success  -> `{ userId, displayName }`.
 *              internal -> a generic message with the stripId as a reference: unknown user, database failure.
 *              There is no user error: viewing cannot be corrected by the user.
 * Side effects: none on data. The only write is to the cache. A cache failure never fails the view:
 *              a failed read behaves like a miss, and a failed write is skipped.
 */
export const viewProfile = defineStrip({
  name: "profile.view",
  budget: { reads: ["users", "cache:profile"], writes: ["cache:profile"], storage: [] },
  steps: [readCachedProfile, findUserProfile, writeCachedProfile],
  invalidates: [],
  routing: {
    "cache.profile.read": "log-and-continue",
    "db.user.findProfile": { not_found: "abort" },
    "cache.profile.write": "log-and-continue",
    "*": "abort",
  },
});
