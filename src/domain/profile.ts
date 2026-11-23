// The example domain: a user has a unique display name, and a profile is what the UI shows.
// Schemas live here because a step file may export only steps (rule R09), and several steps share them.

import { z } from "zod";
import type { CollectionDef } from "../ports/database.ts";

export const ProfileSchema = z.object({ userId: z.string(), displayName: z.string() });
export type Profile = z.infer<typeof ProfileSchema>;

/** Collections this example needs. The shell and the tests pass them to `database.migrate()`. */
export const USERS: CollectionDef = {
  name: "users",
  fields: {
    displayName: { type: "string" },
    // The port lowercases this field, so uniqueness ignores case while `displayName` keeps what the user typed.
    displayNameKey: { type: "string", unique: true, normalize: "lower" },
  },
};
export const collections: CollectionDef[] = [USERS];

/** Profiles stay cached for one minute. A cache is never the source of truth. */
export const PROFILE_TTL_MS = 60_000;

export const profileCacheKey = (userId: string): string => `profile:${userId}`;

/** A users record with both name fields set. Use it whenever a user is created or renamed. */
export const nameFields = (displayName: string): { displayName: string; displayNameKey: string } => ({
  displayName,
  displayNameKey: displayName,
});

/** Users the local demo and the tests start with. */
export const DEMO_USERS: readonly { id: string; displayName: string }[] = [
  { id: "u1", displayName: "Ada" },
  { id: "u2", displayName: "Grace" },
];
