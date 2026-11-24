import { z } from "zod";
import { requireOwner } from "../../../../lib/authz.ts";
import { err, makeError, ok } from "../../../../lib/result.ts";
import { defineStep } from "../../../../lib/step.ts";
import { CreatedKeySchema, PrincipalSchema } from "../../domain.ts";
import { generateKey, hashKey } from "../../keygen.ts";

/**
 * Replaces an active key with a new one that has the same name and expiry date. The new key is created and the
 * old one revoked in one batch, so a failure leaves both as they were. The new key is in the output once.
 */
export const rotateKey = defineStep({
  name: "db.keys.rotate",
  class: "db",
  input: z.object({ principal: PrincipalSchema, keyId: z.string().min(1) }),
  output: CreatedKeySchema.extend({ replacedId: z.string() }),
  permissions: { reads: ["api_keys"], writes: ["api_keys"], storage: [] },
  errors: ["unauthorized", "forbidden", "not_found", "conflict", "network", "unexpected"],
  uses: ["database", "ids", "clock"],
  sensitive: true,
  run: async (input, ctx) => {
    const found = await ctx.database.read("api_keys").get(input.keyId);
    if (!found.ok) return err(found.error);
    const old = found.value;
    if (old === null) return err(makeError("not_found", "db.keys.rotate", ctx.stripId, `no key ${input.keyId}`));
    const allowed = requireOwner(input.principal, String(old.accountId), { step: "db.keys.rotate", stripId: ctx.stripId });
    if (!allowed.ok) return allowed;
    const now = ctx.clock.now();
    const expiresAt = old.expiresAt === null ? null : String(old.expiresAt);
    if (old.revokedAt !== null || (expiresAt !== null && Date.parse(expiresAt) <= Date.parse(now))) {
      return err(
        makeError("conflict", "db.keys.rotate", ctx.stripId, `key ${old.id} is not active`, {
          audience: "user",
          userMessage: "Only an active key can be rotated. Create a new key instead.",
        }),
      );
    }
    const { prefix, key } = generateKey(ctx.ids);
    const id = ctx.ids.next();
    const batch = await ctx.database.batch([
      {
        op: "create",
        collection: "api_keys",
        record: {
          id,
          accountId: String(old.accountId),
          name: String(old.name),
          prefix,
          keyHash: hashKey(key),
          expiresAt,
          revokedAt: null,
          lastUsedAt: null,
        },
      },
      { op: "update", collection: "api_keys", id: old.id, patch: { revokedAt: now } },
    ]);
    if (!batch.ok) return err(batch.error);
    return ok({ id, name: String(old.name), prefix, key, createdAt: now, expiresAt, replacedId: old.id });
  },
});
