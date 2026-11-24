// Test ports for this feature: its collection, and the memory Auth adapter with two accounts (Ada and Grace),
// so a test can check that one account cannot touch another's keys.

import { makeTestPorts as makeGenericTestPorts } from "../../test-utils/ports.ts";
import type { DatabaseKind } from "../../test-utils/ports.ts";
import type { Principal } from "../../lib/principal.ts";
import { apiKeysFeature } from "./feature.ts";

export { DATABASE_KINDS } from "../../test-utils/ports.ts";
export type { DatabaseKind };

export async function makeTestPorts(options: { database?: DatabaseKind } = {}) {
  const base = await makeGenericTestPorts({ ...options, features: [apiKeysFeature] });
  const ada = await base.ports.auth.createAccount({ email: "ada@example.com", password: "ada-password-123" });
  const grace = await base.ports.auth.createAccount({ email: "grace@example.com", password: "grace-password-1", role: "user" });
  const root = await base.ports.auth.createAccount({ email: "root@example.com", password: "root-password-12", role: "admin" });
  if (!ada.ok || !grace.ok || !root.ok) throw new Error("test accounts could not be created");
  const as = (a: { id: string; role: "user" | "admin" }): Principal => ({ kind: "user", accountId: a.id, role: a.role });
  return { ...base, principals: { ada: as(ada.value), grace: as(grace.value), root: as(root.value) } };
}
