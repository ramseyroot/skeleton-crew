// Test ports for this feature: the feature's collections and demo account, with the memory Auth adapter or the
// local one on top of a memory or SQLite database.

import { createLocalAuth } from "../../adapters/auth/local/index.ts";
import { createSequenceIds } from "../../adapters/ids/sequence/index.ts";
import { makeTestPorts as makeGenericTestPorts } from "../../test-utils/ports.ts";
import type { DatabaseKind } from "../../test-utils/ports.ts";
import { accountsFeature } from "./feature.ts";

export type AuthCase = { name: string; auth: "memory" | "local"; database: DatabaseKind };

/** The combinations every accounts strip is tested with. */
export const AUTH_CASES: readonly AuthCase[] = [
  { name: "auth memory", auth: "memory", database: "memory" },
  { name: "auth local on database memory", auth: "local", database: "memory" },
  { name: "auth local on database sqlite", auth: "local", database: "sqlite" },
];

export async function makeTestPorts(options: { auth?: "memory" | "local"; database?: DatabaseKind; seed?: boolean } = {}) {
  const useLocal = options.auth === "local";
  const base = await makeGenericTestPorts({ database: options.database, features: options.seed === false ? [] : [accountsFeature] });
  if (!useLocal) {
    if (options.seed === false) await base.ports.database.migrate(accountsFeature.collections);
    return base;
  }
  // The generic helper seeded through the memory adapter. Swap in the local one and seed again.
  const migrated = await base.ports.database.migrate(accountsFeature.collections);
  if (!migrated.ok) throw new Error(`accounts test database could not migrate: ${migrated.error.message}`);
  const ports = { ...base.ports, auth: createLocalAuth({ database: base.ports.database, clock: base.clock, ids: createSequenceIds("acct") }) };
  if (options.seed !== false) {
    const seeded = await accountsFeature.seed?.(ports);
    if (seeded && !seeded.ok) throw new Error(`accounts test seed failed: ${seeded.error.message}`);
  }
  return { ...base, ports };
}
