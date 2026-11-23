---
created: 2026-11-23
updated: 2026-11-23
---

# Design: Skeleton Core

Implements `requirements.md` (R1 to R11 here mean its requirements, not conformance rules, which are written `R01` to `R41`). Background: `docs/function-strips-plan.md`, `docs/provider-ports.md`, `docs/environments.md`.

Values marked **(proposed)** are new defaults shown for review. They are listed in the last section, and none is a decision until you mark it.

## 1. Constraints from what already exists

- Node 24 runs `.ts` files directly (type stripping). The repo uses `erasableSyntaxOnly`, so source has no enums, parameter properties or namespaces. Imports end in `.ts`.
- The conformance checker reads manifests without running code (R11), so `name`, `class`, `permissions`, `errors` in steps and `name`, `budget`, `invalidates`, `routing` in strips are written as literals. `input` and `output` may be any expression, so zod schemas are fine.
- Adapter folders each need `errors.ts` (R21). Ports need two adapter folders (R18), `contract.test.ts` (R19), and a test in each adapter folder that imports it (R20). This applies to every port, including `logger`, `clock` and `ids`.
- `src/adapters/logger/` is the only place that may call `console` (config `loggerAdapter`).
- `src/config/profiles.ts` is loaded in a separate Node process by R23. It must run under plain Node with no Next.js imports, and `profileSchema` needs `safeParse()`.
- `tsconfig.json` currently has `lib: ["es2024"]` and no JSX. The Next.js shell and Storybook need `jsx` and `dom` types. Changing `tsconfig.json` is allowed (not protected) and is part of the Next.js shell task.

## 2. Layout

```
src/
  lib/
    result.ts            Result, StepError, ok, err, fromThrown
    step.ts              defineStep, the wrapper, ctx
    strip.ts             defineStrip, runner, routing, StripResult
    cache-envelope.ts    wrap, unwrap, cache keys
  ports/
    logger.ts  clock.ts  ids.ts  database.ts  cache.ts  storage.ts
  adapters/
    logger/   console/ memory/   contract.test.ts
    clock/    system/  fixed/    contract.test.ts
    ids/      uuid/    sequence/ contract.test.ts
    database/ memory/  sqlite/   contract.test.ts
    cache/    memory/  null/     contract.test.ts
    storage/  memory/  fs/       contract.test.ts
    (each adapter folder: index.ts, errors.ts, <name>.test.ts)
  config/
    profiles.ts          profiles, profileSchema (plain Node, zod only)
    registry.ts          adapter name to factory and the hosts it reaches
    compose.ts           profile to a ports object; startup guard
  steps/
    pure/profile/  cache/profile/  db/user/     (one file per step)
  strips/
    profile.save.strip.ts   profile.view.strip.ts
  components/
    ProfileForm/  Toast/    (component + stories)
  test-utils/fixtures.ts    okResult, errResult
  app/                      Next.js App Router shell
.storybook/
```

## 3. Core types

**Result** (`lib/result.ts`). Exactly as plan section 4. `StepError.audience: "user"` requires `userMessage` through a discriminated union:

```ts
type StepErrorBase = { kind: ErrorKind; step: string; stripId: string; message: string; retryable: boolean; cause?: unknown };
export type StepError =
  | (StepErrorBase & { audience: "internal"; userMessage?: undefined })
  | (StepErrorBase & { audience: "user"; userMessage: string });
```

`fromThrown(thrown, step, stripId)` builds `kind: "unexpected"`, `audience: "internal"`, with `message` taken from the thrown value for logs only. A `TypedError` (a plain object with `kind`, created by `typedError(kind, message, opts)`) thrown from a step keeps its kind. `JSON.stringify` drops `cause`, so serialization never carries it (R1.3).

**Ports in the context.** Every port method returns `Promise<Result<T>>`. Adapters never throw for expected failures. Anything they do throw is caught by the step wrapper and becomes `unexpected`.

**defineStep** (`lib/step.ts`).

```ts
defineStep({
  name: "db.user.setDisplayName",
  class: "db",
  input: z.object({ userId: z.string(), displayName: z.string() }),
  output: UserSchema,
  permissions: { reads: ["users"], writes: ["users"], storage: [] },
  errors: ["not_found", "conflict", "network", "unexpected"],
  uses: ["database"],                       // extra field, see below
  run: async (input, ctx) => ctx.database.write("users").update(input.userId, { displayName: input.displayName }),
});
```

- The wrapper parses input, runs `run`, parses output, and returns `Result`. Schema failure gives `validation`. A thrown value gives `unexpected`. If `run` returns a `Result`, it is passed through (R2.5). A plain value is wrapped in `ok`.
- **`uses`** lists the ports the step needs: any of `database`, `cache`, `storage`, `clock`, `ids`. It is an extra manifest field. The checker only requires the six existing fields, so `uses` is allowed, and it is not compared by R17 (no-widening). Proposed D2: add it to the catalog later if useful. `ctx` contains `stripId`, `log`, and only the ports in `uses`.
- **Permission narrowing** (R2.7). `ctx.database.read(collection)` exists only for collections in `permissions.reads` or `permissions.writes`. `ctx.database.write(collection)` exists only for collections in `permissions.writes`. A call outside the list returns a `forbidden` error, and the type of `write` is `never` when `writes` is `[]`. `ctx.storage` is narrowed the same way by prefix. `ctx.cache` is narrowed to key prefixes declared in `permissions.reads` (read) and `permissions.writes` (write) with a `cache:` prefix. Proposed D3: keep cache permissions as `cache:<namespace>` strings in the same lists, so the checker and catalog need no change.
- The returned step object exposes `manifest` and is callable as `step.execute(input, runCtx)`. The runner uses `execute`.

**defineStrip** (`lib/strip.ts`).

- Types: a tuple of steps is checked by a generic `Chain<Steps>` type that requires `Output<Steps[i]>` to be assignable to `Input<Steps[i+1]>`. A mismatch fails the typecheck (R3.2).
- Load-time checks (R3.3 to R3.5) throw an `Error` with the step and permission named. A throw at import time is acceptable here because it is a programming error found by `pnpm check` and tests, not a runtime failure. Proposed D4: the checks also run in conformance (R12 to R14), so a throw is a second line of defense.
- `run(strip, ports, input)` returns `StripResult<T>`:

```ts
type Display = { type: "toast"; message: string } | { type: "generic"; reference: string };
type StripResult<T> =
  | { ok: true; value: T; stripId: string }
  | { ok: false; error: StepError; display: Display; stripId: string };
```

- The runner creates `stripId` (from `IdGenerator`), runs steps in order, and for each error looks up routing: exact step name then `"*"`, then error kind then `"*"`. Entries follow plan section 8.
  - `toast`: `display` is `toast` with `userMessage` if `audience: "user"`, otherwise `generic` with `stripId` as the reference (R3.8). The strip stops.
  - `abort`: the strip stops. `display` is `generic` for internal errors and `toast` for user errors.
  - `retry:n`: re-runs the failing step up to `n` more times while `retryable` is true, then falls back to `abort`.
  - `log-and-continue`: logs and passes the step's input to the next step. Proposed D5: allowed only when the step's output type equals its input type, which the type check enforces, otherwise the strip fails to compile.
  - `recover:<stepName>`: runs the named step with the failing step's input and uses its output as the failing step's output. The recover step must be in `steps`.
- After success, if any step wrote, the runner deletes the keys in `invalidates` through the cache port. Placeholders such as `{userId}` are filled from the strip's input object. A missing placeholder value is a `validation` error and is logged, and the strip result is still `ok` (the write already happened). Proposed D6.
- The runner catches everything and never throws (R3.9).

## 4. Logger port, config, cache envelope

**Logger** (`ports/logger.ts`): `log(entry)` with the entry shape from plan section 13 plus `env`. Redaction (R4.2) happens in a shared `redact(entry, env)` function in the port file: in `prod` it removes `input`, `output`, and `error.cause`. Adapters: `console` (writes one JSON line per entry through `console.log`, and an optional pretty printer for `local`) and `memory` (keeps entries in an array for assertions).

**Profiles** (`config/profiles.ts`): a zod schema `profileSchema` with `env`, `adapters` (a record of port name to adapter name), and `allowedHosts`. `profiles` has `local`, `dev` and `prod`.

- `local`: database `sqlite` (file under `.data/`, git-ignored), cache `memory`, storage `fs` (folder under `.data/`), logger `console`, clock `system`, ids `uuid`. `allowedHosts: ["localhost", "127.0.0.1"]`.
- `dev` and `prod`: the skeleton can only name adapters that exist. Proposed D7: both name `sqlite`, `memory` and `fs` too, with `allowedHosts: []` and file paths taken from required env variables (`DATABASE_PATH`, `STORAGE_PATH`) so they cannot silently share the local file. Each app replaces them with its own adapters. Memory is not used for `prod`.
- `compose.ts` reads `APP_ENV`, parses the profile, asks `registry.ts` for each adapter, checks that the hosts each adapter declares are within `allowedHosts` (R5.5), and returns the ports. Unknown or missing `APP_ENV`, a schema failure, an unregistered adapter, or a host outside the list stops startup with all problems listed (R5.3 to R5.6). `local` hosts and `dev` versus `prod` hosts are also checked by R23 and R24.

**Cache envelope** (`lib/cache-envelope.ts`): `wrap(value, {schemaVersion, ttlMs, now})` and `unwrap(raw, schema, {schemaVersion, now})` returning `{hit:true,value}` or `{hit:false, reason}`. A hit needs a valid shape, a matching version, a non-expired `storedAt + ttl`, and a value that passes the schema. `cacheKey({app, env, adapter, schemaVersion, key})` builds the namespaced key. Adapters call these functions, so every adapter stores the same envelope, and on a miss caused by corruption they delete the entry and log at debug level.

## 5. Ports and adapters

All timestamps are ISO 8601 UTC strings (P2). IDs are text from `IdGenerator`.

| Port | Methods | Adapters |
|---|---|---|
| `Clock` | `now(): string` | `system`, `fixed` (settable) |
| `IdGenerator` | `next(): string` | `uuid` (UUIDv7 or `crypto.randomUUID`, proposed D8: `randomUUID`, sortable IDs not needed yet), `sequence` |
| `Database` | `read(coll)`: `get(id)`, `findBy(field, value)`, `list({cursor, limit})`. `write(coll)`: `create(record)`, `update(id, patch)`, `delete(id)`. `batch(ops)`, `health()`, `migrate()` | `memory`, `sqlite` (`node:sqlite`) |
| `Cache` | `get(key, schema)`, `set(key, value, {ttlMs, schemaVersion})`, `delete(key)`, `deleteByPrefix(prefix)` (capability `prefixDelete`) | `memory`, `null` |
| `ObjectStorage` | `get(key)`, `put(key, bytes, {contentType})`, `delete(key)`, `list(prefix, cursor)` | `memory`, `fs` |
| `Logger` | `log(entry)` | `console`, `memory` |

Database details:

- A record is a plain JSON object with `id`, `createdAt`, `updatedAt` plus its own fields. The adapter sets the two timestamps from the `Clock` given to its factory. Collections are declared by name with a zod schema at `migrate()` time. The port is generic and has no SQL. App-specific repository ports (`UserReader`) can be built on top of it later, and they are not part of the skeleton.
- `findBy(field, value)` is limited to fields the collection marks as indexed, and string values are lowercased at the port when the field is marked `normalize: "lower"`. This is the only query besides `list`.
- `list` returns `{items, nextCursor}`. The cursor is an opaque string (a base64 of the last ID). Order is by `id`.
- `batch(ops)` is an array of `create`, `update`, `delete` operations run as one atomic unit. `sqlite` uses one SQLite transaction inside the adapter. `memory` copies on write and swaps. If any operation fails, nothing is applied and the error names the failing operation.
- Errors: missing read gives `null`. Missing update or delete gives `not_found`. A duplicate ID or violated unique field gives `conflict`.
- `errors.ts` in `sqlite` maps SQLite error codes (for example `ERR_SQLITE_ERROR` with constraint messages) to `conflict` or `unexpected`. The table is data, and the contract suite triggers a real constraint failure to test it. Each adapter's `errors.ts` exports `mapError(thrown): ErrorKind`.
- Migrations are owned by adapters. `migrate()` is idempotent. The contract suite calls it twice.

Cache details: `get` returns `{hit:false}` for absent, corrupt, outdated, and expired entries. The `null` adapter always misses and accepts writes. Capability `prefixDelete`: proposed D9 is that `null` declares it true (it stores nothing, so deleting is trivially correct), so both adapters declare it and no case is skipped. The capability mechanism is still built and tested with a fake adapter that declares it false.

ObjectStorage details: `fs` resolves keys inside its root and rejects keys that escape it (`..`, absolute paths) as `validation`. This is tested.

Every contract suite is a function `runContract(name, makeAdapter, caps)` that registers `node:test` cases. Each adapter folder has `<name>.test.ts` calling it. Planned adapters (PocketBase, Supabase, Workers KV, R2) are written as a `Planned adapters` section in the port's header comment and in `docs/provider-ports.md`, and no folder exists for them, so the checker never counts them (R7.11).

## 6. Example strips

Steps (narrow, one file each, names unique):

| Step | Class | Input | Output | Permissions |
|---|---|---|---|---|
| `pure.profile.parseForm` | pure | `{userId, displayName: string}` raw | same, trimmed, 1 to 60 characters | none |
| `db.user.setDisplayName` | db | `{userId, displayName}` | `User` | reads and writes `users` |
| `cache.profile.read` | cache | `{userId}` | `{userId, cached: Profile or null}` | reads `cache:profile` |
| `db.user.findProfile` | db | `{userId, cached}` | `Profile` (returns `cached` if set, else reads `users`, `not_found` if absent) | reads `users` |
| `cache.profile.write` | cache | `Profile` | `Profile` | writes `cache:profile` |

Strips:

- `profile.save`: `parseForm`, `setDisplayName`. Budget: reads and writes `users`. `invalidates: ["profile:{userId}"]`. Routing: `parseForm: validation: toast`, `setDisplayName: conflict: toast, not_found: abort, network: retry:2`, `"*": "abort"`. The parse step makes a user-audience error with a written message for an empty or too long name. `conflict` in `setDisplayName` is a user error ("That name is taken", when the example collection marks `displayName` unique).
- `profile.view`: `cache.profile.read`, `db.user.findProfile`, `cache.profile.write`. Budget: reads `users`, reads and writes `cache:profile`. No step writes the database, so `invalidates: []`. Routing: cache steps `"*": "log-and-continue"` (a cache failure never fails the view), `db.user.findProfile: not_found: abort`.
- `db.user.findProfile` takes `cached` because chaining passes only the previous output. This is a deliberate compromise (proposed D10) so the example needs no new strip features. The alternative is a `recover` route, which would turn a cache miss into an error, and the plan says a miss is a value.

Tests per strip: with `memory` database and with `sqlite`; cache `memory` and `null`; the five end states from requirement 8.5; and that `profile.save` removes `profile:<userId>` from the cache.

## 7. Next.js shell and Storybook

- `src/app/page.tsx` (server component) calls `compose()` once, runs `profile.view` and renders `<ProfileForm>`. `src/app/actions.ts` (`"use server"`) runs `profile.save` and returns a plain `StripResult`. Plain objects only, as plan section 4 requires.
- `ProfileForm` and `Toast` are client components with `Result`-shaped props (a `ViewState` of loading, success, user error, internal error with reference, or empty). They import no strips, no ports and no adapters.
- Storybook: `@storybook/nextjs-vite` with the stories next to the components. Stories use `okResult` and `errResult` from `test-utils/fixtures.ts`. Only the `Docs` addon is skipped, to keep it light. Proposed D11: no addons beyond the defaults.
- `node:sqlite` inside a Next.js server bundle may need to be marked external. This is checked in the verification task (section 9), and if it fails, `local` uses `memory` for the shell and `sqlite` stays tested through the strips.

## 8. Dependencies and reasons (R11.3)

| Package | Why | Type |
|---|---|---|
| `zod` | Schemas for manifests, config, cache entries (P1). Zod 4 has `safeParse`, as R23 requires | runtime |
| `next`, `react`, `react-dom` | The shell | runtime |
| `@types/react`, `@types/react-dom` | Types for the shell and stories | dev |
| `storybook`, `@storybook/nextjs-vite`, `vite` | Component previews (P8). `@storybook/nextjs-vite` 10.6.8 lists `next` 14 to 16 and `vite` 5 to 8 as peers, and requires `react` 16.8 or later | dev |

No other packages. Tests use `node:test` (P3), SQLite uses `node:sqlite` (P4), IDs use `crypto.randomUUID`.

## 9. Verification before building (task 1)

A short spike in a throwaway folder, results recorded in `progress.md` and in this document before the dependent tasks run:

1. `pnpm add` of the packages above works with TypeScript 7 and pnpm 11 and does not break `pnpm check`.
2. Storybook starts and shows one story. Record start time and memory on this PC.
3. `next build` succeeds with `node:sqlite` imported from a server module. If not, use the fallback in section 7.
4. Zod 4 passes R23's `safeParse` contract.
5. The checker accepts `uses` in a manifest.

### Results (task 1, 2026-11-23)

| Check | Result |
|---|---|
| 1. Install with TypeScript 7 and pnpm 11 | Works. One peer warning: `tsconfck` (inside Storybook's Vite tooling) wants TypeScript 5, we have 7. No failure seen. pnpm blocked the `esbuild` build script, so `pnpm-workspace.yaml` was added with `allowBuilds: esbuild: false`. Storybook and Next.js ran without it |
| 2. Storybook | `@storybook/nextjs-vite` 10.6.8 started and served one story: 353 ms for the manager and 388 ms for the preview, about 715 MB resident memory in total (all processes). It sends telemetry by default, so the config sets `core.disableTelemetry` for offline use |
| 3. `next build` with `node:sqlite` | Build passes in 9.6 s, and `next start` served a page that read a row through `node:sqlite`. No fallback is needed. Next.js rewrites `tsconfig.json` (`jsx: react-jsx`), so the root file was set to that value now |
| 4. zod 4 `safeParse` | Exists, as R23 expects |
| 5. `uses` in a manifest | The checker accepted it: only R16 (catalog out of date) fired for the probe step |

If 2 or 3 fail, the cut order from P10 applies: the shell shrinks first, then Storybook breadth.

## 10. Task outline

The final list, with `Writes:` and modes, is `tasks.md`. In short: 1 setup and spike, 2 `Result` and cache envelope, 3 logger, clock and ID ports, 4 database port and 5 cache and storage ports (parallel), 6 step library, 7 strip library, 8 config, 9 example steps, strips and catalog, 10 components and stories, 11 Next.js shell, 12 final docs and `checks.test`.

## 11. New defaults (D1 to D11 confirmed)

| # | Proposal | Alternative | State |
|---|---|---|---|
| D1 | Database port is a generic record store (`read`, `write`, `batch`) with collections declared at `migrate()`. App repository ports are built later in the apps | Hand-written `UserReader` and `UserWriter` ports in the skeleton | confirmed (user, 2026-11-23) |
| D2 | Steps declare `uses: [...]` as an extra manifest field. Not compared by R17 | Derive ports from `class` | confirmed (user, 2026-11-23) |
| D3 | Cache permissions are `cache:<namespace>` strings in the existing `reads` and `writes` lists | A new `cache` list in permissions, which needs checker changes | confirmed (user, 2026-11-23) |
| D4 | `defineStrip` throws at load time for budget, routing and invalidates errors, in addition to conformance | Conformance only | confirmed (user, 2026-11-23) |
| D5 | `log-and-continue` only on steps whose output type equals their input type | Allow any | confirmed (user, 2026-11-23) |
| D6 | Missing invalidation placeholders log a `validation` error and do not fail a finished write | Fail the strip | confirmed (user, 2026-11-23) |
| D7 | `dev` and `prod` in the skeleton reuse `sqlite`, `memory` and `fs` with required env paths and `allowedHosts: []`. Apps replace them | Omit `dev` and `prod` until an app needs them | confirmed (user, 2026-11-23) |
| D8 | `crypto.randomUUID` for IDs | UUIDv7 | confirmed (user, 2026-11-23) |
| D9 | `NullCache` declares `prefixDelete` true. The capability mechanism is tested with a fake adapter | Skip cases for `null` | confirmed (user, 2026-11-23) |
| D10 | `db.user.findProfile` takes the `cached` value, so the example needs no new strip feature | Add a conditional step feature | confirmed (user, 2026-11-23) |
| D11 | Storybook with default addons only | Add the accessibility addon | confirmed (user, 2026-11-23) |
| D5b | Refines D5. `log-and-continue` is allowed on a step when its input is a valid input for the next step (or, for the last step, a valid output). Equal input and output types still qualify. D5's wording was too narrow for the `profile.view` example, where `cache.profile.read` takes `{userId}` and its output adds `cached` | Keep D5 as written (equal types only), and change the example | confirmed (user, 2026-11-23) |
| D12 | `recover:<step>` names a step in a separate `fallbacks` list of the strip, which is not part of the chain. The design said "must be in `steps`", which would also run the fallback in the chain. The checker reads only `steps`, so fallbacks are budget-checked at load time by `defineStrip` but not by R13 | Fallbacks listed in `steps` and skipped in the chain | confirmed (user, 2026-11-23) |
