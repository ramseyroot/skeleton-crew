import { requireSignedIn } from "../../../../lib/authz.ts";
import { defineStep } from "../../../../lib/step.ts";
import { err, ok } from "../../../../lib/result.ts";
import { CheckedCreateSchema, CreatedKeySchema } from "../../domain.ts";
import { generateKey, hashKey } from "../../keygen.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Creates a key for the signed-in account. The full key is in the output once and is not stored. */
export const createKey = defineStep({
  name: "db.keys.create",
  class: "db",
  input: CheckedCreateSchema,
  output: CreatedKeySchema,
  permissions: { reads: [], writes: ["api_keys"], storage: [] },
  errors: ["unauthorized", "conflict", "network", "unexpected"],
  uses: ["database", "ids", "clock"],
  sensitive: true,
  run: async (input, ctx) => {
    const who = requireSignedIn(input.principal, { step: "db.keys.create", stripId: ctx.stripId });
    if (!who.ok) return who;
    const { prefix, key } = generateKey(ctx.ids);
    const now = ctx.clock.now();
    const expiresAt = input.expiresInDays === null ? null : new Date(Date.parse(now) + input.expiresInDays * DAY_MS).toISOString();
    const created = await ctx.database.write("api_keys").create({
      id: ctx.ids.next(),
      accountId: who.value.accountId,
      name: input.name,
      prefix,
      keyHash: hashKey(key),
      expiresAt,
      revokedAt: null,
      lastUsedAt: null,
    });
    if (!created.ok) return err(created.error);
    return ok({ id: created.value.id, name: input.name, prefix, key, createdAt: created.value.createdAt, expiresAt });
  },
});
