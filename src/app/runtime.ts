// Builds the app's ports once per server process: the active profile, migrated collections, and demo data for `local`.
// Server only. Nothing in components or steps imports this file.

import { composeOrThrow } from "../config/compose.ts";
import type { Composed } from "../config/compose.ts";
import { features } from "./features.ts";

export type Runtime = Composed;

type Env = Record<string, string | undefined>;

/**
 * Composes the ports for the profile in `env.APP_ENV` and prepares the database.
 * Each feature's demo data is added when the profile is `local`, or when APP_SEED=1. Never in `prod`. Seeds are idempotent.
 */
export async function createRuntime(env: Env): Promise<Runtime> {
  const composed = composeOrThrow({ env });
  const { ports, profile } = composed;

  const migrated = await ports.database.migrate(features.flatMap((f) => f.collections));
  if (!migrated.ok) throw new Error(`database migration failed: ${migrated.error.message}`);

  const wantSeed = profile.env === "local" || env.APP_SEED === "1";
  if (wantSeed && profile.env !== "prod") {
    for (const feature of features) {
      const seeded = await feature.seed?.(ports);
      if (seeded && !seeded.ok) throw new Error(`seeding "${feature.name}" failed: ${seeded.error.message}`);
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
