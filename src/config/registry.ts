// The adapter registry: adapter name to factory, plus the hosts each adapter reaches.
// This is the only place that imports adapters. Steps and strips never do (rule R03 and the plan, section 11).

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createLogMetrics } from "../adapters/metrics/log/index.ts";
import { createMemoryMetrics } from "../adapters/metrics/memory/index.ts";
import { createNoneMetrics } from "../adapters/metrics/none/index.ts";
import { createLogReporter } from "../adapters/reporter/log/index.ts";
import { createMemoryReporter } from "../adapters/reporter/memory/index.ts";
import { createNoneReporter } from "../adapters/reporter/none/index.ts";
import { createLocalAuth } from "../adapters/auth/local/index.ts";
import { createMemoryAuth } from "../adapters/auth/memory/index.ts";
import { createDatabaseLimiter } from "../adapters/limiter/database/index.ts";
import { createMemoryLimiter } from "../adapters/limiter/memory/index.ts";
import { createMemoryCache } from "../adapters/cache/memory/index.ts";
import { createNullCache } from "../adapters/cache/null/index.ts";
import { createFixedClock } from "../adapters/clock/fixed/index.ts";
import { createSystemClock } from "../adapters/clock/system/index.ts";
import { createMemoryDatabase } from "../adapters/database/memory/index.ts";
import { createSqliteDatabase } from "../adapters/database/sqlite/index.ts";
import { createSequenceIds } from "../adapters/ids/sequence/index.ts";
import { createUuidIds } from "../adapters/ids/uuid/index.ts";
import { createConsoleLogger } from "../adapters/logger/console/index.ts";
import { createMemoryLogger } from "../adapters/logger/memory/index.ts";
import { createFsStorage } from "../adapters/storage/fs/index.ts";
import { createMemoryStorage } from "../adapters/storage/memory/index.ts";
import type { Auth } from "../ports/auth.ts";
import type { Cache } from "../ports/cache.ts";
import type { Clock } from "../ports/clock.ts";
import type { Database } from "../ports/database.ts";
import type { IdGenerator } from "../ports/ids.ts";
import type { RateLimiter } from "../ports/limiter.ts";
import type { Logger } from "../ports/logger.ts";
import type { Metrics } from "../ports/metrics.ts";
import type { ErrorReporter } from "../ports/reporter.ts";
import type { ObjectStorage } from "../ports/storage.ts";

export type Settings = {
  app: string;
  env: string;
  schemaVersion: number;
  logFormat: "json" | "pretty";
  databasePath: string;
  storagePath: string;
};

export type Entry<T, Deps> = {
  /** Hosts this adapter talks to. Empty means it works offline. Each must be in the profile's allowedHosts. */
  hosts: readonly string[];
  create: (settings: Settings, deps: Deps) => T;
};

export type Registry = {
  clock: Record<string, Entry<Clock, Record<never, never>>>;
  logger: Record<string, Entry<Logger, { clock: Clock }>>;
  ids: Record<string, Entry<IdGenerator, Record<never, never>>>;
  database: Record<string, Entry<Database, { clock: Clock }>>;
  cache: Record<string, Entry<Cache, { clock: Clock; logger: Logger }>>;
  storage: Record<string, Entry<ObjectStorage, Record<never, never>>>;
  reporter: Record<string, Entry<ErrorReporter, { logger: Logger }>>;
  metrics: Record<string, Entry<Metrics, { logger: Logger }>>;
  auth: Record<string, Entry<Auth, { database: Database; clock: Clock; ids: IdGenerator }>>;
  limiter: Record<string, Entry<RateLimiter, { database: Database; clock: Clock }>>;
};

const OFFLINE: readonly string[] = [];

export const registry: Registry = {
  clock: {
    system: { hosts: OFFLINE, create: () => createSystemClock() },
    fixed: { hosts: OFFLINE, create: () => createFixedClock() },
  },
  logger: {
    console: { hosts: OFFLINE, create: (s, d) => createConsoleLogger({ env: s.env, clock: d.clock, format: s.logFormat }) },
    memory: { hosts: OFFLINE, create: (s, d) => createMemoryLogger({ env: s.env, clock: d.clock }) },
  },
  ids: {
    uuid: { hosts: OFFLINE, create: () => createUuidIds() },
    sequence: { hosts: OFFLINE, create: () => createSequenceIds() },
  },
  database: {
    memory: { hosts: OFFLINE, create: (_s, d) => createMemoryDatabase({ clock: d.clock }) },
    sqlite: {
      hosts: OFFLINE,
      create: (s, d) => {
        mkdirSync(dirname(s.databasePath), { recursive: true });
        return createSqliteDatabase({ clock: d.clock, path: s.databasePath });
      },
    },
  },
  cache: {
    memory: { hosts: OFFLINE, create: (s, d) => createMemoryCache({ app: s.app, env: s.env, schemaVersion: s.schemaVersion, ...d }) },
    null: { hosts: OFFLINE, create: (s, d) => createNullCache({ app: s.app, env: s.env, schemaVersion: s.schemaVersion, ...d }) },
  },
  storage: {
    memory: { hosts: OFFLINE, create: () => createMemoryStorage() },
    fs: {
      hosts: OFFLINE,
      create: (s) => {
        mkdirSync(s.storagePath, { recursive: true });
        return createFsStorage({ root: s.storagePath });
      },
    },
  },
  reporter: {
    none: { hosts: OFFLINE, create: () => createNoneReporter() },
    memory: { hosts: OFFLINE, create: () => createMemoryReporter() },
    log: { hosts: OFFLINE, create: (_s, d) => createLogReporter({ logger: d.logger }) },
  },
  metrics: {
    none: { hosts: OFFLINE, create: () => createNoneMetrics() },
    memory: { hosts: OFFLINE, create: () => createMemoryMetrics() },
    log: { hosts: OFFLINE, create: (_s, d) => createLogMetrics({ logger: d.logger }) },
  },
  auth: {
    local: { hosts: OFFLINE, create: (_s, d) => createLocalAuth({ database: d.database, clock: d.clock, ids: d.ids }) },
    memory: { hosts: OFFLINE, create: (_s, d) => createMemoryAuth({ clock: d.clock, ids: d.ids }) },
  },
  limiter: {
    memory: { hosts: OFFLINE, create: (_s, d) => createMemoryLimiter({ clock: d.clock }) },
    database: { hosts: OFFLINE, create: (_s, d) => createDatabaseLimiter({ database: d.database, clock: d.clock }) },
  },
};
