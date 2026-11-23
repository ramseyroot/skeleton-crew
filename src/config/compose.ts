// Builds the ports for the active profile and refuses to start when anything is wrong (docs/environments.md section 4).
//
// `compose()` never throws. It returns every problem it finds, so one startup shows all of them.
// `composeOrThrow()` is for the app's entry point: it turns the problems into one readable error.

import type { Ports } from "../lib/step.ts";
import { crossProfileProblems, profileSchema, profiles } from "./profiles.ts";
import type { Profile } from "./profiles.ts";
import { registry } from "./registry.ts";
import type { Registry, Settings } from "./registry.ts";

export type ComposeOptions = {
  /** Usually process.env. */
  env: Record<string, string | undefined>;
  app?: string;
  /** Bump to make every cache entry a miss. */
  cacheSchemaVersion?: number;
  /** For tests. Defaults to the skeleton's profiles. */
  profiles?: Record<string, unknown>;
  /** For tests. Defaults to the real registry. */
  registry?: Registry;
};

export type Composed = {
  profile: Profile;
  app: string;
  /** True for local and dev, false for prod. Read-only information derived from the profile. It selects no adapter. */
  dev: boolean;
  ports: Ports;
};
export type ComposeResult = { ok: true; value: Composed } | { ok: false; problems: string[] };

const PORT_ORDER = ["clock", "logger", "ids", "database", "cache", "storage", "reporter", "metrics"] as const;

export function compose(options: ComposeOptions): ComposeResult {
  const problems: string[] = [];
  const all: Record<string, unknown> = options.profiles ?? profiles;
  const reg = options.registry ?? registry;
  const app = options.app ?? options.env.APP_NAME ?? "skeleton";

  const selected = options.env.APP_ENV;
  if (selected === undefined || selected === "") {
    return { ok: false, problems: [`APP_ENV is not set. Set it to one of: ${Object.keys(all).join(", ")}`] };
  }
  const raw = Object.hasOwn(all, selected) ? all[selected] : undefined;
  if (raw === undefined) {
    return { ok: false, problems: [`APP_ENV is "${selected}", which is not a profile. Use one of: ${Object.keys(all).join(", ")}`] };
  }

  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      problems.push(`profile ${selected}: ${issue.path.length > 0 ? issue.path.join(".") : "(root)"}: ${issue.message}`);
    }
    return { ok: false, problems };
  }
  const profile = parsed.data;

  if (profile.env !== selected) problems.push(`profile ${selected} says env is "${profile.env}"`);

  // Problems that involve other profiles (shared paths, production hosts in dev, non-local hosts in local).
  const others: Record<string, Profile> = {};
  for (const [name, p] of Object.entries(all)) {
    const other = profileSchema.safeParse(p);
    if (other.success) others[name] = other.data;
  }
  for (const problem of crossProfileProblems(others)) problems.push(problem);

  // Each adapter must be registered, and the hosts it reaches must be allowed.
  for (const port of PORT_ORDER) {
    const name = profile.adapters[port];
    const entry = (reg[port] as Record<string, { hosts: readonly string[] } | undefined>)[name];
    if (entry === undefined) {
      problems.push(`profile ${selected} uses ${port} adapter "${name}", which is not registered`);
      continue;
    }
    const outside = entry.hosts.filter((h) => !profile.allowedHosts.includes(h));
    if (outside.length > 0) {
      problems.push(`${port} adapter "${name}" reaches ${outside.join(", ")}, which profile ${selected} does not allow`);
    }
  }

  // File paths: the profile's own, otherwise the environment variables.
  const databasePath = profile.paths.database ?? options.env.DATABASE_PATH;
  const storagePath = profile.paths.storage ?? options.env.STORAGE_PATH;
  if (profile.adapters.database === "sqlite" && !databasePath) {
    problems.push(`profile ${selected} uses sqlite, so DATABASE_PATH must be set`);
  }
  if (profile.adapters.storage === "fs" && !storagePath) {
    problems.push(`profile ${selected} uses fs storage, so STORAGE_PATH must be set`);
  }
  if (selected !== "local") {
    const local = all.local as { paths?: { database?: string; storage?: string } } | undefined;
    if (databasePath && databasePath === local?.paths?.database) problems.push(`profile ${selected} must not use the local database path ${databasePath}`);
    if (storagePath && storagePath === local?.paths?.storage) problems.push(`profile ${selected} must not use the local storage path ${storagePath}`);
  }

  if (problems.length > 0) return { ok: false, problems };

  const settings: Settings = {
    app,
    env: profile.env,
    schemaVersion: options.cacheSchemaVersion ?? 1,
    logFormat: profile.logFormat,
    databasePath: databasePath ?? "",
    storagePath: storagePath ?? "",
  };
  try {
    const clock = reg.clock[profile.adapters.clock]!.create(settings, {});
    const logger = reg.logger[profile.adapters.logger]!.create(settings, { clock });
    const ids = reg.ids[profile.adapters.ids]!.create(settings, {});
    const database = reg.database[profile.adapters.database]!.create(settings, { clock });
    const cache = reg.cache[profile.adapters.cache]!.create(settings, { clock, logger });
    const storage = reg.storage[profile.adapters.storage]!.create(settings, {});
    const reporter = reg.reporter[profile.adapters.reporter]!.create(settings, { logger });
    const metrics = reg.metrics[profile.adapters.metrics]!.create(settings, { logger });
    const dev = profile.env !== "prod";
    return { ok: true, value: { profile, app, dev, ports: { env: profile.env, database, cache, storage, clock, ids, logger, reporter, metrics } } };
  } catch (thrown) {
    return { ok: false, problems: [`could not build the adapters for profile ${selected}: ${thrown instanceof Error ? thrown.message : String(thrown)}`] };
  }
}

export function composeOrThrow(options: ComposeOptions): Composed {
  const result = compose(options);
  if (result.ok) return result.value;
  throw new Error(`Startup stopped. ${result.problems.length} problem(s):\n${result.problems.map((p) => `  - ${p}`).join("\n")}`);
}
