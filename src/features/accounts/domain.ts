// Shared by the accounts steps, strips and pages. Schemas live here because a step file may export only steps (R09).

import { z } from "zod";
import { AUTH_COLLECTIONS } from "../../ports/auth.ts";
import type { CollectionDef } from "../../ports/database.ts";

export const AccountSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.enum(["user", "admin"]),
  createdAt: z.string(),
});
export type AccountView = z.infer<typeof AccountSchema>;

export const CredentialsSchema = z.object({ email: z.string(), password: z.string() });
export const SessionSchema = z.object({ token: z.string(), expiresAt: z.string() });

/** The collections the local Auth adapter keeps through the Database port. */
export const collections: CollectionDef[] = AUTH_COLLECTIONS;

export { SESSION_COOKIE } from "../../shared/session.ts";

/** The demo account added outside prod. Its password is public on purpose: it only exists in local and dev data. */
export const DEMO_ACCOUNT = { email: "demo@example.com", password: "demo-password-123" } as const;
