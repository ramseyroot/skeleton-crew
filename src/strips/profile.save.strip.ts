import { defineStrip } from "../lib/strip.ts";
import { setUserDisplayName } from "../steps/db/user.setDisplayName.ts";
import { parseProfileForm } from "../steps/pure/profile.parseForm.ts";

/**
 * profile.save: a user changes their display name.
 *
 * Trigger:     the profile form is submitted (Server Action), input `{ userId, displayName }`.
 * End states:  success   -> `{ userId, displayName }` (the saved profile).
 *              user error -> a toast: an empty or too long name, or a name that is already taken.
 *              internal   -> a generic message with the stripId as a reference: unknown user, database failure.
 * Side effects: only `db.user.setDisplayName` writes. If it fails nothing is changed. If it succeeds the cached
 *              profile is removed (`invalidates`), so the next view reads fresh data. A failed invalidation is
 *              logged and does not undo the write.
 */
export const saveProfile = defineStrip({
  name: "profile.save",
  budget: { reads: ["users"], writes: ["users"], storage: [] },
  steps: [parseProfileForm, setUserDisplayName],
  invalidates: ["profile:{userId}"],
  routing: {
    "pure.profile.parseForm": { validation: "toast" },
    "db.user.setDisplayName": { conflict: "toast", not_found: "abort", network: "retry:2" },
    "*": "abort",
  },
});
