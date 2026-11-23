// Builds the app's ports once per server process: the active profile, migrated collections, and demo data for `local`.
// Server only. Nothing in components or steps imports this file.

import { collections, DEMO_USERS, nameFields } from "../domain/profile.ts";
import { composeOrThrow } from "../config/compose.ts";
import type { Composed } from "../config/compose.ts";

export type Runtime = Composed;

type Env = Record<string, string | undefined>;

/**
 * Composes the ports for the profile in `env.APP_ENV` and prepares the database.
 * Demo users are added when the profile is `local`, or when APP_SEED=1. Never in `prod`. Adding is idempotent.
 */
export async function createRuntime(env: Env): Promise<Runtime> {
  const composed = composeOrThrow({ env });
  const { ports, profile } = composed;

  const migrated = await ports.database.migrate(collections);
  if (!migrated.ok) throw new Error(`database migration failed: ${migrated.error.message}`);

  const wantSeed = profile.env === "local" || env.APP_SEED === "1";
  if (wantSeed && profile.env !== "prod") {
    for (const user of DEMO_USERS) {
      const existing = await ports.database.read("users").get(user.id);
      if (!existing.ok) throw new Error(`could not check demo user ${user.id}: ${existing.error.message}`);
      if (existing.value === null) {
        const created = await ports.database.write("users").create({ id: user.id, ...nameFields(user.displayName) });
        if (!created.ok) throw new Error(`could not add demo user ${user.id}: ${created.error.message}`);
      }
    }
  }
  return composed;
}

const KEY = Symbol.for("skeleton.runtime");
type Holder = { [KEY]?: Promise<Runtime> };

/** One runtime per process. It survives hot reloads in development. */
export function getRuntime(): Promise<Runtime> {
  const holder = globalThis as Holder;
  holder[KEY] ??= createRuntime(process.env).catch((error: unknown) => {
    holder[KEY] = undefined;
    throw error;
  });
  return holder[KEY];
}

/** For tests. */
export function resetRuntime(): void {
  (globalThis as Holder)[KEY] = undefined;
}
