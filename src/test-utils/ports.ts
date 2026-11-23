// Ports for tests: real adapters, fixed clock, a memory logger, and the example users seeded.
// Used by step and strip tests so each test runs against both database adapters and with the cache on and off.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryCache } from "../adapters/cache/memory/index.ts";
import { createNullCache } from "../adapters/cache/null/index.ts";
import { createFixedClock } from "../adapters/clock/fixed/index.ts";
import { createMemoryDatabase } from "../adapters/database/memory/index.ts";
import { createSqliteDatabase } from "../adapters/database/sqlite/index.ts";
import { createSequenceIds } from "../adapters/ids/sequence/index.ts";
import { createMemoryLogger } from "../adapters/logger/memory/index.ts";
import { createMemoryMetrics } from "../adapters/metrics/memory/index.ts";
import { createMemoryReporter } from "../adapters/reporter/memory/index.ts";
import { createMemoryStorage } from "../adapters/storage/memory/index.ts";
import type { FeatureModule } from "../lib/feature.ts";
import type { Ports } from "../lib/step.ts";
import type { Database } from "../ports/database.ts";

export type DatabaseKind = "memory" | "sqlite";
export type CacheKind = "memory" | "null";

export const DATABASE_KINDS: readonly DatabaseKind[] = ["memory", "sqlite"];
export const CACHE_KINDS: readonly CacheKind[] = ["memory", "null"];

/**
 * `features` are migrated and seeded, like the app's runtime does. A feature passes its own module from its
 * `testing.ts`, so this file knows no feature.
 */
export async function makeTestPorts(
  options: { database?: DatabaseKind; cache?: CacheKind; env?: string; features?: readonly FeatureModule[] } = {},
) {
  const features = options.features ?? [];
  const env = options.env ?? "local";
  const clock = createFixedClock("2026-11-23T12:00:00.000Z");
  const logger = createMemoryLogger({ env, clock });
  let dir: string | null = null;
  let database: Database;
  if (options.database === "sqlite") {
    dir = mkdtempSync(join(tmpdir(), "skel-test-"));
    database = createSqliteDatabase({ clock, path: join(dir, "test.db") });
  } else {
    database = createMemoryDatabase({ clock });
  }
  const migrated = await database.migrate(features.flatMap((f) => f.collections));
  if (!migrated.ok) throw new Error(`test database could not migrate: ${migrated.error.message}`);
  const cacheOptions = { app: "test", env, schemaVersion: 1, clock, logger };
  const cache = options.cache === "null" ? createNullCache(cacheOptions) : createMemoryCache(cacheOptions);
  const reporter = createMemoryReporter();
  const metrics = createMemoryMetrics();
  const ports: Ports = { env, database, cache, storage: createMemoryStorage(), clock, ids: createSequenceIds("strip"), logger, reporter, metrics };
  for (const feature of features) {
    const seeded = await feature.seed?.(ports);
    if (seeded && !seeded.ok) throw new Error(`test database could not seed ${feature.name}: ${seeded.error.message}`);
  }
  return {
    ports,
    logger,
    clock,
    reporter,
    metrics,
    cleanup(): void {
      if (database.name === "sqlite") (database as ReturnType<typeof createSqliteDatabase>).close();
      if (dir) rmSync(dir, { recursive: true, force: true });
    },
  };
}
