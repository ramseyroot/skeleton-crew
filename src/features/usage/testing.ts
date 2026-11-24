// Test ports for this feature: its collection and two accounts on the memory Auth adapter.

import { makeTestPorts as makeGenericTestPorts } from "../../test-utils/ports.ts";
import type { DatabaseKind } from "../../test-utils/ports.ts";
import type { Principal } from "../../lib/principal.ts";
import { usageFeature } from "./feature.ts";

export { DATABASE_KINDS } from "../../test-utils/ports.ts";
export type { DatabaseKind };

export async function makeTestPorts(options: { database?: DatabaseKind } = {}) {
  const base = await makeGenericTestPorts({ ...options, features: [usageFeature] });
  const ada = await base.ports.auth.createAccount({ email: "ada@example.com", password: "ada-password-123" });
  const grace = await base.ports.auth.createAccount({ email: "grace@example.com", password: "grace-password-1" });
  if (!ada.ok || !grace.ok) throw new Error("test accounts could not be created");
  const as = (a: { id: string; role: "user" | "admin" }): Principal => ({ kind: "user", accountId: a.id, role: a.role });
  return { ...base, principals: { ada: as(ada.value), grace: as(grace.value) } };
}
