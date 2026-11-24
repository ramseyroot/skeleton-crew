// What happens between the keys page and the strips, without Next.js, so tests can run it. The Server Action only
// adds the session lookup and the cache refresh.

import { runStrip } from "../../lib/strip.ts";
import type { Ports } from "../../lib/step.ts";
import type { Principal } from "../../lib/principal.ts";
import { toPublicResult } from "../../shared/ui/view-state.ts";
import type { PublicResult } from "../../shared/ui/view-state.ts";
import type { CreatedKey } from "./domain.ts";
import { createApiKey } from "./strips/keys.create.strip.ts";
import { revokeApiKey } from "./strips/keys.revoke.strip.ts";
import { rotateApiKey } from "./strips/keys.rotate.strip.ts";

export type KeyOutcome =
  | { kind: "created"; key: CreatedKey }
  | { kind: "rotated"; key: CreatedKey; replacedId: string }
  | { kind: "revoked"; id: string };

const text = (value: FormDataEntryValue | null): string => (typeof value === "string" ? value : "");

/** Reads the form's `intent` (create, rotate or revoke) and runs the matching strip. */
export async function runKeyIntent(ports: Ports, principal: Principal, form: FormData): Promise<PublicResult<KeyOutcome>> {
  const intent = text(form.get("intent"));
  if (intent === "create") {
    const days = text(form.get("expiresInDays")).trim();
    const r = await runStrip(createApiKey, ports, {
      principal,
      name: text(form.get("name")),
      expiresInDays: days === "" ? null : Number(days),
    });
    return r.ok ? toPublicResult({ ...r, value: { kind: "created" as const, key: r.value } }) : toPublicResult(r);
  }
  if (intent === "rotate") {
    const r = await runStrip(rotateApiKey, ports, { principal, keyId: text(form.get("keyId")) });
    if (!r.ok) return toPublicResult(r);
    const { replacedId, ...key } = r.value;
    return toPublicResult({ ...r, value: { kind: "rotated" as const, key, replacedId } });
  }
  if (intent === "revoke") {
    const r = await runStrip(revokeApiKey, ports, { principal, keyId: text(form.get("keyId")) });
    return r.ok ? toPublicResult({ ...r, value: { kind: "revoked" as const, id: r.value.id } }) : toPublicResult(r);
  }
  // An unknown intent is a bug in the page, not something the user can fix.
  return { ok: false, display: { type: "generic", reference: "unknown-intent" }, stripId: "unknown-intent" };
}
