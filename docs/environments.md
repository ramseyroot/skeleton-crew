---
created: 2026-11-23
updated: 2026-11-23
---

# Environments and Data Separation (Draft v0.1)

Status: draft. Applies to the skeleton and to every app created from it. Companion to `function-strips-plan.md` and `provider-ports.md`.

## 1. Goals

1. An app builds, runs, and can be demonstrated fully offline on a developer PC, with one documented command.
2. Development data and production data never mix, and the development environment keeps existing after production launches.
3. Production may use different providers than development (for example a different database). Switching is a config and adapter change, and steps and strips do not change.
4. A mistake (wrong config, wrong command) cannot reach production data from a local machine.

## 2. Profiles

A profile is a named set of adapter choices and settings. The active profile comes from one variable (`APP_ENV`), and config is validated at startup.

| Profile | Purpose | Network needed | Data |
|---|---|---|---|
| `local` | Build, test, and demo on one PC | No | Local files or processes, seeded demo data, can be reset |
| `dev` | Shared hosted development services | Yes | Its own hosted instances, test data only |
| `staging` (optional) | Prod-like check before release, using prod-type providers | Yes | Its own instances, test data only |
| `prod` | Real users | Yes | Real data |

Adapter choice per port and profile (illustrative; each app fills in its own):

| Port | `local` | `dev` | `prod` |
|---|---|---|---|
| Database | Local database process or file | Hosted dev instance | Prod provider (may differ from dev) |
| Cache | Memory or `NullCache` | Dev provider | Prod provider |
| ObjectStorage | Local folder | Dev bucket | Prod bucket |
| Queue, Scheduler | In-memory, manual trigger | Dev provider | Prod provider |
| Payments | Fake | Provider test mode | Provider live mode |
| Mailer, Notifier | Memory (messages stored for inspection) | Provider test mode or sandbox | Live |
| Llm | Canned responses | Real or canned | Real |
| Logger | Pretty dev printer | Structured JSON | Structured JSON |

## 3. The `local` profile (offline)

- No network calls at startup or in normal flows. Every port has an adapter that works offline (see the table above).
- Every outbound API has a fake or recorded-response adapter. Recorded responses live in fixtures and are used for tests and demos.
- The database runs on the machine. Which local engine to use per app is an app decision, and the app's database adapter must support a local mode.
- A seed command creates deterministic demo data, and a reset command returns to it. Demo runs use the same profile with seeded data.
- Platform bindings (Cloudflare KV, R2, D1, Queues) are replaced by their in-memory or local-file adapters, or by the platform's local emulation if it is reliable enough. Emulation behavior needs verifying.
- The test suite runs under `local` in CI with network access blocked. That proves offline operation instead of assuming it.

## 4. Data separation rules

1. **Each environment has its own instances**: its own database, buckets or prefixes, queues, and credentials. No two environments share a database.
2. **Secrets are per profile.** Production secrets are never in local or dev files, or on developer machines. Local env files are ignored by git.
3. **Startup guard.** Each profile declares the hosts and paths it may reach. The app refuses to start when a profile points outside them (for example `local` with a non-local host, or `dev` with a production host). `prod` requires `APP_ENV=prod` and matching hosts.
4. **The environment name is part of keys and logs.** Cache keys include it, and every log entry carries it, so entries cannot be confused across environments.
5. **Destructive commands check the profile.** Seed, reset, and migrate-down refuse to run on `prod`. Production migrations require an explicit flag and a recorded backup step.
6. **Data flows one way.** Development data is never promoted to production. If production data is ever copied down for debugging, it is anonymized first, and that policy is written before it happens.
7. **Test and demo records are marked** (a source or flag field) so they are easy to find and cannot be mistaken for real data.

## 5. Different providers in development and production

When production uses a different database than development, bugs appear that development cannot show: case sensitivity, ordering, null handling, type strictness, uniqueness, timestamps, and transaction behavior all vary between engines. Controls:

- The database port's decisions are written down (`provider-ports.md`) and tested by one contract suite that runs against every adapter, including the production one.
- CI runs that suite against the production-type engine (for example in a container) on every change, not only against the local one.
- A `staging` profile on production-type services catches drift before release. It is optional but recommended when dev and prod engines differ.
- **Migrations.** Some providers define schema in their own way (for example collection definitions, not plain SQL files). So one shared set of SQL migration files may not be possible. The rule becomes: each adapter has its own migrations, and the contract suite checks that every adapter exposes the same repository behavior, which is what matters to steps.
- **Platform versus engine.** A provider that is a whole platform (database plus auth, storage, and realtime) can be used as a plain database, which keeps swapping cheap, or as a platform, which pulls its auth, storage, and realtime into the `Auth`, `ObjectStorage`, and `Realtime` ports. Each app decides which, and records it in its coverage file.
- This setup still tests less than running the same engine everywhere, and the controls reduce that gap but do not remove it.

## 6. Moving an app to a new production provider

1. Write the adapter and its error mapping table.
2. Pass the port's contract suite against it.
3. Stand up a staging profile on the new provider and run the strip tests.
4. Write a one-way data migration script (kept in the app's repository, tested on copies).
5. Cut over with a checklist and a rollback plan. Keep the old provider read-only until the new one is verified.
6. `local` and `dev` keep working throughout, since they use their own adapters.

## 7. Config shape

```ts
export const profiles = {
  local: {
    env: "local",
    adapters: { database: "<local-db>", cache: "memory", storage: "fs", queue: "memory", payments: "fake" },
    allowedHosts: ["localhost", "127.0.0.1"],
  },
  dev:  { env: "dev",  adapters: { /* hosted dev services */ }, allowedHosts: [/* dev hosts */] },
  prod: { env: "prod", adapters: { /* prod providers */ },     allowedHosts: [/* prod hosts */] },
} as const;
```

Config is parsed with a schema at startup, and a failure stops the app with a readable message.

## 8. Checks

Added to the conformance script (`function-strips-plan.md`, section 15):

1. Every profile validates against the config schema.
2. The `local` profile contains no non-local hosts.
3. Every port used by a profile has an adapter registered for it.
4. Production secret names do not appear in non-production env files.
5. The test suite passes under `local` with network access blocked.
6. Destructive scripts contain the profile guard.

## 9. Open decisions

1. Which local database engine each app uses in `local` (the same engine as `dev`, or a lighter one).
2. Whether platform local emulation (Cloudflare) is reliable enough, or in-memory adapters are used for those bindings.
3. Whether `staging` is required when dev and prod engines differ.
4. How seed and demo data are defined and versioned (fixtures files, a seed strip).
5. Whether demo mode differs from `local` (for example a locked state and a one-click reset).

## 10. To verify before writing adapters

- Local emulation of Cloudflare bindings, and what it does not cover.
- Running the chosen database locally, and how its migrations work.
- Local development options for a hosted platform database, if one is chosen.
