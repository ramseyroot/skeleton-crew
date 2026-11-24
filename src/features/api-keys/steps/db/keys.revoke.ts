import { z } from "zod";
import { requireOwner } from "../../../../lib/authz.ts";
import { err, makeError, ok } from "../../../../lib/result.ts";
import { defineStep } from "../../../../lib/step.ts";
import { PrincipalSchema } from "../../domain.ts";

/** Revokes one key. The owner or an admin may. Revoking a revoked key succeeds and keeps the first time. */
export const revokeKey = defineStep({
  name: "db.keys.revoke",
  class: "db",
  input: z.object({ principal: PrincipalSchema, keyId: z.string().min(1) }),
  output: z.object({ id: z.string(), revokedAt: z.string() }),
  permissions: { reads: ["api_keys"], writes: ["api_keys"], storage: [] },
  errors: ["unauthorized", "forbidden", "not_found", "network", "unexpected"],
  uses: ["database", "clock"],
  run: async (input, ctx) => {
    const found = await ctx.database.read("api_keys").get(input.keyId);
    if (!found.ok) return err(found.error);
    if (found.value === null) return err(makeError("not_found", "db.keys.revoke", ctx.stripId, `no key ${input.keyId}`));
    const allowed = requireOwner(input.principal, String(found.value.accountId), { step: "db.keys.revoke", stripId: ctx.stripId });
    if (!allowed.ok) return allowed;
    if (found.value.revokedAt !== null) return ok({ id: found.value.id, revokedAt: String(found.value.revokedAt) });
    const revokedAt = ctx.clock.now();
    const updated = await ctx.database.write("api_keys").update(input.keyId, { revokedAt });
    if (!updated.ok) return err(updated.error);
    return ok({ id: input.keyId, revokedAt });
  },
});
