import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { err, makeError, ok } from "../../../../lib/result.ts";
import { defineStep } from "../../../../lib/step.ts";
import { KEY_ERROR_MESSAGE, VerifiedKeySchema } from "../../domain.ts";
import { hashKey, prefixOf } from "../../keygen.ts";

const NOTHING = hashKey("no such key");

/**
 * Checks a presented key. Every way to fail (bad shape, unknown prefix, wrong secret, revoked, expired) gives the
 * same error, and the hash comparison runs in constant time, also when the prefix is unknown.
 */
export const verifyKey = defineStep({
  name: "db.keys.verify",
  class: "db",
  input: z.object({ key: z.string() }),
  output: VerifiedKeySchema,
  permissions: { reads: ["api_keys", "accounts"], writes: [], storage: [] },
  errors: ["unauthorized", "network", "unexpected"],
  uses: ["database", "auth", "clock"],
  sensitive: true,
  run: async (input, ctx) => {
    const invalid = () =>
      err(
        makeError("unauthorized", "db.keys.verify", ctx.stripId, "key rejected", {
          audience: "user",
          userMessage: KEY_ERROR_MESSAGE,
        }),
      );
    const prefix = prefixOf(input.key);
    const found = prefix === null ? null : await ctx.database.read("api_keys").findBy("prefix", prefix);
    if (found && !found.ok) return found;
    const record = found?.ok ? (found.value[0] ?? null) : null;
    const expected = Buffer.from(record ? String(record.keyHash) : NOTHING);
    const presented = Buffer.from(hashKey(input.key));
    const same = expected.length === presented.length && timingSafeEqual(expected, presented);
    if (!record || !same) return invalid();
    if (record.revokedAt !== null) return invalid();
    if (record.expiresAt !== null && Date.parse(String(record.expiresAt)) <= Date.parse(ctx.clock.now())) return invalid();
    const account = await ctx.auth.getAccount(String(record.accountId));
    if (!account.ok) return account.error.kind === "not_found" ? invalid() : account;
    return ok({ keyId: record.id, accountId: account.value.id, role: account.value.role });
  },
});
