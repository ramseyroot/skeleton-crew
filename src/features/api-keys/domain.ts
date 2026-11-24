// Shared by the api-keys steps, strips and page. Schemas live here because a step file may export only steps (R09).

import { z } from "zod";
import type { CollectionDef } from "../../ports/database.ts";

/** Keys. `keyHash` is the SHA-256 of the whole key. The key itself is never stored. */
export const API_KEYS: CollectionDef = {
  name: "api_keys",
  fields: {
    accountId: { type: "string", indexed: true },
    name: { type: "string" },
    prefix: { type: "string", unique: true },
    keyHash: { type: "string", unique: true },
    expiresAt: { type: "string", optional: true },
    revokedAt: { type: "string", optional: true },
    lastUsedAt: { type: "string", optional: true },
  },
};
export const collections: CollectionDef[] = [API_KEYS];

export const PrincipalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user"), accountId: z.string(), role: z.enum(["user", "admin"]) }),
  z.object({ kind: z.literal("key"), accountId: z.string(), keyId: z.string(), role: z.enum(["user", "admin"]) }),
  z.object({ kind: z.literal("anonymous"), ip: z.string() }),
]);

export const CreateRequestSchema = z.object({
  principal: PrincipalSchema,
  name: z.string(),
  expiresInDays: z.number().nullish(),
});

export const CheckedCreateSchema = z.object({
  principal: PrincipalSchema,
  name: z.string().min(1).max(60),
  expiresInDays: z.number().int().min(1).max(365).nullable(),
});

/** What the owner sees once, when a key is created or rotated. `key` is the only copy there will ever be. */
export const CreatedKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  key: z.string(),
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
});
export type CreatedKey = z.infer<typeof CreatedKeySchema>;

export const KeyRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  state: z.enum(["active", "revoked", "expired"]),
});
export type KeyRow = z.infer<typeof KeyRowSchema>;

export const VerifiedKeySchema = z.object({
  keyId: z.string(),
  accountId: z.string(),
  role: z.enum(["user", "admin"]),
});

export const KEY_ERROR_MESSAGE = "That API key is not valid.";
