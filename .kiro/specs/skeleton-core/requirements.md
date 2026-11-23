---
created: 2026-11-23
updated: 2026-11-23
---

# Requirements Document: Skeleton Core

## Introduction

This spec builds the skeleton's runtime core: the `Result` type, steps, strips, the logger, config and profiles, the cache envelope, three ports with two adapters each, one example strip with Storybook stories, and a minimal Next.js shell. It is based on `docs/function-strips-plan.md`, `docs/provider-ports.md` and `docs/environments.md`.

It does not cover the enforcement layer (done), billing, entitlements, metering, rate limits, auth, payments, mailer, queue, other optional ports, Cloudflare deployment, or any app.

All code must pass `pnpm check` (41 conformance rules) and run offline.

### Terms

Step, strip, port, adapter, receiver, catalog and stripId are defined in `docs/function-strips-plan.md` section 2.

### Proposed defaults

Every value marked **(proposed)** is a default shown for review. It is not a decision until the user marks it `confirmed` or `changed` in the table in the last section. Later documents use only confirmed or changed values.

---

## Requirements

### Requirement 1: Result and StepError

**User Story:** As a developer, I want one result type for every step, so that a failure can never be mistaken for a value.

#### Acceptance Criteria

1. THE `lib/result.ts` module SHALL export `Result<T>`, `StepError`, and `ErrorKind` exactly as in plan section 4.
2. THE module SHALL export `ok(value)` and `err(error)` helpers.
3. A `StepError` SHALL be a plain object that survives JSON serialization unchanged, except for `cause`, which is dropped on serialization.
4. `audience` SHALL default to `internal`. WHEN `audience` is `user`, THEN `userMessage` SHALL be required by the type.
5. THE module SHALL export a helper that builds a `StepError` from a thrown value and returns `kind: "unexpected"`, without copying the thrown value's message into `userMessage`.

### Requirement 2: defineStep and the step wrapper

**User Story:** As a developer, I want every step declared with a manifest and run through one wrapper, so that logging, error conversion and permissions are the same everywhere.

#### Acceptance Criteria

1. `defineStep()` SHALL require `name`, `class`, `input` schema, `output` schema, `permissions`, `errors`, and `run`.
2. WHEN a step runs, THEN the wrapper SHALL parse the input with its schema, run the function, parse the output with its schema, and return a `Result`.
3. WHEN the input or output fails its schema, THEN the wrapper SHALL return a `validation` error naming the step.
4. WHEN the function throws, THEN the wrapper SHALL return an `unexpected` error. A typed error thrown by the function SHALL keep its `kind`.
5. WHEN a step already returns a `Result`, THEN the wrapper SHALL pass it through unchanged.
6. THE wrapper SHALL log entry and exit through the Logger port with the entry shape in plan section 13.
7. THE `ctx.ports` object SHALL contain only the ports its permissions allow. A step that declares `writes: []` SHALL receive no write method.
8. THE exported step SHALL expose its manifest, so the catalog generator can read it.

### Requirement 3: defineStrip and the runner

**User Story:** As a developer, I want a feature defined as one strip file with a permission budget and routing, so that the feature's behavior and limits are in one place.

#### Acceptance Criteria

1. `defineStrip()` SHALL require `name`, `budget`, `steps`, `invalidates`, and `routing`.
2. WHEN a step's output type does not match the next step's input type, THEN the typecheck SHALL fail.
3. WHEN the steps' combined permissions exceed the budget, THEN `defineStrip()` SHALL fail at load time with a message naming the step and permission.
4. WHEN a step has no routing entry and no `"*"` entry exists, THEN `defineStrip()` SHALL fail at load time.
5. WHEN any step writes and `invalidates` is missing, THEN `defineStrip()` SHALL fail. An explicitly empty list SHALL be accepted.
6. THE runner SHALL create a `stripId` at the start of each run and pass it to every step.
7. THE runner SHALL apply the routing actions `toast`, `retry:n`, `abort`, `log-and-continue`, and `recover:<stepName>` as in plan section 8.
8. WHEN the action is `toast` and the error's audience is `internal`, THEN the runner SHALL downgrade it to a generic message plus the `stripId` as a reference.
9. THE runner SHALL return a `Result` and SHALL NOT throw.
10. WHEN `retry:n` is set, THEN the runner SHALL retry only errors with `retryable: true`, at most `n` times.

### Requirement 4: Logger port

**User Story:** As a developer, I want logging behind a port, so that no step calls `console` and every line carries its stripId.

#### Acceptance Criteria

1. THE `Logger` port SHALL accept an entry matching plan section 13, with the profile's environment name added.
2. THE port SHALL redact payload fields before output in `prod`, and keep them in `local` and `dev`.
3. THE Logger port SHALL have two adapters: a console-JSON adapter in `src/adapters/logger/` and a memory adapter that tests can assert on.
4. ONLY the console-JSON adapter SHALL call `console`.
5. THE port SHALL have a contract suite that runs against both adapters.

### Requirement 5: Config and profiles

**User Story:** As a developer, I want one validated profile choosing the adapters and allowed hosts, so that a wrong setting stops the app at startup.

#### Acceptance Criteria

1. THE file `src/config/profiles.ts` SHALL export `profiles` and `profileSchema`.
2. THE `profiles` object SHALL define `local`, `dev` and `prod` with `env`, `adapters` per port, and `allowedHosts`, as in `docs/environments.md` section 7.
3. THE active profile SHALL be selected by `APP_ENV`. WHEN `APP_ENV` is missing or unknown, THEN startup SHALL fail with a readable message.
4. WHEN a profile fails `profileSchema`, THEN startup SHALL fail with a readable message listing every problem.
5. WHEN `local` contains a non-local host, or `dev` contains a host listed for `prod`, THEN startup SHALL fail.
6. WHEN a profile names an adapter that is not registered for its port, THEN startup SHALL fail.
7. THE adapter chosen by the profile SHALL be the only way a step receives a port. Steps SHALL NOT import adapters.

### Requirement 6: Cache envelope

**User Story:** As a developer, I want every cache entry stored in one versioned shape, so that corrupt or outdated entries become misses.

#### Acceptance Criteria

1. THE `lib/cache-envelope.ts` module SHALL define `{ schemaVersion, storedAt, ttl, value }` and functions to wrap and unwrap it.
2. WHEN an entry fails its schema, has a different `schemaVersion`, or is expired, THEN unwrapping SHALL return a miss, and the adapter SHALL delete the entry and log at debug level.
3. A miss SHALL be `{ hit: false }` and SHALL NOT be an error.
4. CACHE keys SHALL include the app name, the profile's environment name, the adapter name and the schema version.
5. THE module SHALL be tested with valid, corrupt, outdated, and expired entries.

### Requirement 7: Database, Cache and ObjectStorage ports

**User Story:** As a developer, I want the three first ports to follow the port rules, so that swapping a provider changes an adapter and config, and nothing else.

#### Acceptance Criteria

1. EACH of the three ports SHALL be in `src/ports/`, written in domain terms, with no raw query method.
2. EACH port SHALL have two adapters in `src/adapters/<port>/<provider>/` and a `contract.test.ts` that runs the same suite against both.
3. EACH port's adapters SHALL have an `errors.ts` with a tested table from provider errors to `ErrorKind`.
4. THE Database port SHALL provide: atomic writes as a batch of operations, a health check, cursor pagination with an opaque cursor, `null` for a missing read by key, `not_found` for a write to a missing record, an empty list for no matches, `conflict` for constraint violations, and application-generated text IDs.
5. THE Database port SHALL also provide migrations owned by each adapter.
6. THE Cache port SHALL provide `get(key, schema)`, `set(key, value, ttl)`, `delete(key)`, and `deleteByPrefix(prefix)` behind a capability flag. Its `NullCache` SHALL always miss and always accept writes.
7. THE ObjectStorage port SHALL provide `get`, `put`, `delete`, and `list(prefix, cursor)`. `get` of a missing key SHALL return `null`, and `delete` of a missing key SHALL succeed.
8. WHEN an adapter lacks a feature the port offers, THEN it SHALL declare a capability flag, and the contract suite SHALL skip only the matching cases.
9. THE contract suites SHALL run with the network blocked.
10. THE `Clock` and `IdGenerator` ports SHALL exist, each with a system adapter and a fixed or sequential adapter, because the Database port and the steps need them.
11. Real adapters planned for later (listed in the last section) SHALL be recorded as `planned` in the port's documentation and SHALL NOT be claimed as built.

### Requirement 8: Example strip

**User Story:** As a developer, I want one complete strip, so that the pattern can be seen working end to end and copied.

#### Acceptance Criteria

1. THE example strip SHALL be `profile.save` as sketched in plan section 8, built from narrow steps of at least these classes: `pure`, `cache`, and `db`.
2. EACH step SHALL be created with `defineStep()` and be listed in the generated catalog.
3. THE strip SHALL declare its budget, routing, `invalidates`, trigger and end states, and side-effect boundary.
4. THE strip's tests SHALL run with the cache on and with `NullCache`, and SHALL check that a successful write invalidates the listed keys.
5. THE strip's tests SHALL cover a validation error shown to the user, a `conflict`, a not-found abort, and an unexpected internal error that gives a generic message plus reference code.
6. THE strip's tests SHALL run against both Database adapters.

### Requirement 9: Storybook stories

**User Story:** As a developer on a low-spec PC, I want to preview every UI state in Storybook, so that I do not have to run the full app.

#### Acceptance Criteria

1. THE project SHALL include a Storybook setup that starts without the database or any network call.
2. THE shared `test-utils/fixtures.ts` SHALL export `okResult(value)` and `errResult(kind, audience)`.
3. THE example form component SHALL receive `Result`-shaped props and SHALL NOT call a strip.
4. THE example component SHALL have one story per end state: loading, success, user error, internal error with reference code, and empty.
5. A `Toast` component SHALL have stories for a user error, an internal error with reference code, and a long message.
6. THE Storybook build SHALL be verified at least once, and its start-up time and memory use on this PC SHALL be recorded in `progress.md`.

### Requirement 10: Next.js shell

**User Story:** As a developer, I want a minimal Next.js app wired to the example strip, so that apps created from the template have a starting point.

#### Acceptance Criteria

1. THE shell SHALL be a Next.js App Router project with one page showing the example form.
2. THE page SHALL call the example strip through a Server Action. The component SHALL receive the `Result`, not the strip.
3. WHEN `APP_ENV=local`, THEN the shell SHALL start offline with the in-memory or local adapters selected by the profile.
4. THE shell SHALL show a `user` error as a toast message and an `internal` error as a generic message with its reference code.
5. THE shell SHALL pass `pnpm check`, and the build SHALL be verified once.
6. Cloudflare and OpenNext deployment SHALL NOT be part of this spec.

### Requirement 11: Tooling and gates

**User Story:** As a developer, I want the whole core verified by one command, so that nothing is left unchecked.

#### Acceptance Criteria

1. THE project SHALL have a test command that runs all core tests and is configured as `checks.test`, so `pnpm check` and the Stop hook run it.
2. WHEN the spec's tasks finish, THEN `pnpm check` SHALL pass, the tests SHALL pass with the network blocked, and the catalog SHALL be regenerated and committed.
3. EACH new dependency SHALL be listed with its reason in the design document.
4. THE skeleton core SHALL keep `lib/`, `ports/` and `adapters/` free of app-specific code, so they can be separated into a package later.
5. EACH task SHALL follow `docs/change-process.md`: a `started` row, one commit, and a `done` row in `progress.md`.

### Requirement 12: Error reporter port

**User Story:** As a developer, I want unexpected failures sent to an error-tracking service in production only, so that real problems are seen without development noise.

#### Acceptance Criteria

1. THE `ErrorReporter` port SHALL have a `report(error, context)` method that is synchronous, returns nothing, and never throws. The context holds the strip name, the stripId, and the environment name.
2. THE port SHALL have three adapters: `none` (drops the report), `memory` (keeps reports for tests), and `log` (writes one entry through the Logger port). A hosted adapter (Sentry or similar) SHALL be recorded as `planned`.
3. WHEN a strip run ends in an `internal` error of kind `unexpected`, `upstream`, or `network`, THEN the runner SHALL report it once. THE runner SHALL NOT report `user` errors, other kinds, errors handled by `log-and-continue` or `recover`, or errors fixed by a retry.
4. A failure inside the reporter SHALL NOT change the strip's result.
5. THE `log` adapter's entries SHALL pass through the Logger port's redaction, so `prod` drops message text.
6. THE port SHALL have a contract suite that runs against all three adapters, and each adapter SHALL have an `errors.ts`.

### Requirement 13: Metrics port

**User Story:** As a developer, I want counts and timings per strip and step, so that I can see errors and slowness in production.

#### Acceptance Criteria

1. THE `Metrics` port SHALL have `increment(name, tags?)` and `timing(name, ms, tags?)`, both synchronous and never throwing.
2. THE port SHALL have three adapters: `none`, `memory` (assertable), and `log` (one entry through the Logger port). A hosted adapter SHALL be recorded as `planned`.
3. THE runner SHALL emit `strip.runs` with tags `strip` and `outcome`, and `strip.duration_ms` with the same tags. THE step wrapper SHALL emit `step.duration_ms` with tags `step` and `outcome`. WHEN a run fails, THEN the tag `kind` SHALL hold the error kind.
4. THE port SHALL accept only the tag keys `strip`, `step`, `outcome` and `kind`, and SHALL drop any other key, so that metric cardinality stays bounded.
5. A failure inside the metrics adapter SHALL NOT change a step's or strip's result.
6. THE port SHALL have a contract suite that runs against all three adapters, and each adapter SHALL have an `errors.ts`.

### Requirement 14: The dev flag and gating

**User Story:** As a developer, I want development runs to send nothing to tracking services, and production runs to send everything, chosen by the profile, so that development noise stays out and no flag can point a development machine at production data.

#### Acceptance Criteria

1. THE composed runtime SHALL expose `dev: boolean`, derived from `APP_ENV`: true for `local` and `dev`, false for `prod`.
2. IN the `local` and `dev` profiles, the `reporter` and `metrics` adapters SHALL be `none` or `memory`. IN `prod`, they SHALL NOT be `none`. Profile validation SHALL report a breach with the profile and port named.
3. THE `dev` flag SHALL only be read, never set from outside, and SHALL NOT choose any adapter. Adapters SHALL come from the profile, and the startup guards for hosts and paths SHALL apply unchanged.
4. Steps and strips SHALL NOT receive the `dev` flag.
5. Logger redaction SHALL stay tied to the environment name as before.

---

## Defaults and their state (P1 to P10 confirmed)

| # | Proposal | Alternative | State |
|---|---|---|---|
| P1 | Add `zod` for schemas | Own schema helper | confirmed (user, 2026-11-23) |
| P2 | Timestamps are ISO 8601 UTC strings at the database port | Epoch milliseconds | confirmed (user, 2026-11-23) |
| P3 | Tests run with Node's built-in `node:test` | Vitest | confirmed (user, 2026-11-23) |
| P4 | Database adapters: memory and `node:sqlite`. PocketBase and Supabase are `planned` and belong to the apps | PocketBase first | confirmed (user, 2026-11-23) |
| P5 | Cache adapters: memory and `NullCache`. Workers KV is `planned` | Memory plus file cache | confirmed (user, 2026-11-23) |
| P6 | ObjectStorage adapters: memory and a local folder. R2 is `planned` | | confirmed (user, 2026-11-23) |
| P7 | Example strip is `profile.save` | Another feature | confirmed (user, 2026-11-23) |
| P8 | Storybook with the Vite-based Next.js framework, verified against TypeScript 7 first | Webpack-based | confirmed (user, 2026-11-23) |
| P9 | `checks.test` is set to the new test command, which needs an unlock of `conformance.config.json` | Keep it `null` | confirmed (user, 2026-11-23) |
| P10 | Cut order if time runs short: second adapters, then the Next.js shell reduced to one page and action, then Storybook breadth | | confirmed (user, 2026-11-23) |
| P11 | Error reporter, metrics and the `dev` flag are added to this spec (requirements 12 to 14), as the user asked on 2026-11-23. The user confirmed that `APP_ENV` stays and that `dev` is derived from it | | confirmed (user, 2026-11-23) |
