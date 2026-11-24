import { z } from "zod";
import { requireSignedIn } from "../../../../lib/authz.ts";
import { err, ok } from "../../../../lib/result.ts";
import { defineStep } from "../../../../lib/step.ts";
import { KeyRowSchema, PrincipalSchema } from "../../domain.ts";
import type { KeyRow } from "../../domain.ts";

/** Lists the signed-in account's keys, newest first. A row shows the prefix and state, never the key. */
export const listKeys = defineStep({
  name: "db.keys.list",
  class: "db",
  input: z.object({ principal: PrincipalSchema }),
  output: z.object({ keys: z.array(KeyRowSchema) }),
  permissions: { reads: ["api_keys"], writes: [], storage: [] },
  errors: ["unauthorized", "network", "unexpected"],
  uses: ["database", "clock"],
  run: async (input, ctx) => {
    const who = requireSignedIn(input.principal, { step: "db.keys.list", stripId: ctx.stripId });
    if (!who.ok) return who;
    const found = await ctx.database.read("api_keys").findBy("accountId", who.value.accountId);
    if (!found.ok) return err(found.error);
    const now = Date.parse(ctx.clock.now());
    const keys: KeyRow[] = found.value.map((r) => {
      const revokedAt = r.revokedAt === null ? null : String(r.revokedAt);
      const expiresAt = r.expiresAt === null ? null : String(r.expiresAt);
      const state = revokedAt !== null ? "revoked" : expiresAt !== null && Date.parse(expiresAt) <= now ? "expired" : "active";
      return {
        id: r.id,
        name: String(r.name),
        prefix: String(r.prefix),
        createdAt: r.createdAt,
        lastUsedAt: r.lastUsedAt === null ? null : String(r.lastUsedAt),
        expiresAt,
        revokedAt,
        state,
      };
    });
    keys.sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1));
    return ok({ keys });
  },
});
