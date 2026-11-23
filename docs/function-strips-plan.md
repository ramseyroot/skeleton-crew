# Function and Strip Plan (Draft v0.2)

Status: draft. No code yet. Stack assumed: Next.js, TypeScript, Storybook for UI preview. Hosting target for the web and API: Cloudflare Workers through the OpenNext adapter. Databases and background work are chosen per app and may run elsewhere (for example PocketBase with SQLite, or a separate program for scraping).

Related docs: `app-parts-checklist.md` (parts of an app), `provider-ports.md` (ports, adapters, contracts), `environments.md` (profiles, offline local mode, data separation), `app-coverage.template.md` (per-app coverage).

## 1. Goals

1. A failure can never be mistaken for a value.
2. Any failure can be traced to one step of one run of one feature.
3. Strips (chains of functions) are designed as units, and steps can be reused across strips.
4. UI can be developed and previewed in Storybook without running the backend.
5. Switching a provider (database, cache, storage, payments) changes an adapter and config, and does not change steps or strips.
6. Requirements are enforced by checks that list every violation, not by instructions the agent must remember.
7. Reusing a step is checkable: its inputs, outputs, and permissions are declared and compared, not guessed from its name.
8. An app builds, runs, and demos fully offline on a developer PC, and development data never mixes with production data (see `environments.md`).

## 2. Terms

- **Step**: one function inside a strip.
- **Strip**: an ordered chain of steps that implements one feature.
- **stripId**: a unique ID created when a strip starts. It is passed to every step and logged with every entry.
- **Receiver**: the code at the end of a strip that consumes its result (toast, page, API response, logger).
- **Port**: an interface a step depends on (`Cache`, `ObjectStorage`, `Logger`, a repository). Written in domain terms.
- **Adapter**: an implementation of a port for one provider (KV, R2, D1, Paystack, an in-memory fake).
- **Catalog**: a generated list of every step and strip with its signature and permissions.

## 3. Repository model

- This repository is the skeleton: the template that apps are created from.
- Each app is its own repository, created from the skeleton. There is no monorepo.
- An app adds its own strips, steps, repositories, adapters it needs, and config. It does not edit the skeleton's `lib/` rules to fit one app.
- Apps start as a copy of this repository's template (see section 17, decision 3).
- Not everything runs inside the skeleton's runtime. An app may run ingestion as a separate program in another language (for example a Go scraper writing into PocketBase). That program is outside the step and strip rules. The skeleton asks two things of it: records carry provenance fields (source, source URL, fetch time, license note), and its log lines use the log entry shape in section 13 so one stripId or run ID can be followed across programs.

Portability claim, stated plainly: the skeleton promises swappable data and service adapters (database, cache, storage, queue, payments, mailer). It does not promise moving off the Worker runtime. Cloudflare-specific pieces, such as Durable Objects for realtime state, sit behind a port, and the port documents that its only adapter is Cloudflare-specific.

## 4. Result and error shape

Every step returns `Result<T>`. Steps do not throw to their callers, and they never return an error as a string value.

```ts
export type Result<T> = { ok: true; value: T } | { ok: false; error: StepError };

export type ErrorKind =
  | "validation"    // input or data did not match its schema
  | "not_found"
  | "conflict"
  | "unauthorized"
  | "forbidden"     // authenticated, but not allowed
  | "rate_limited"
  | "network"       // timeout, DNS, connection
  | "upstream"      // API answered with 5xx or unusable data
  | "unexpected";   // anything not classified

export type StepError = {
  kind: ErrorKind;
  step: string;                  // step name, explicit string (survives minification)
  stripId: string;
  audience: "user" | "internal"; // default "internal"
  userMessage?: string;          // required when audience is "user"
  message: string;               // for logs only, never shown to users
  retryable: boolean;
  cause?: unknown;
};
```

Rules:

- `audience` defaults to `internal`. A step opts in to `user` explicitly and supplies `userMessage`.
- Steps report facts (`kind`). Strips decide presentation and routing (see section 8).
- `StepError` must be a plain serializable object (no class instances) so it can cross the Server Action boundary.
- Raw `error.message` text is never rendered in UI.
- Adapters translate provider failures into these kinds (section 11). A step never sees a provider-specific error.
- Classes may add kinds that only they use (the optional `scrape` class in section 6 does).

## 5. Step wrapper

All steps run through one wrapper, `step()`, which:

1. Logs entry (step name, source of input, input summary).
2. Runs the function inside try/catch.
3. Converts thrown values into `StepError` (`kind: "unexpected"` unless the function threw a typed error).
4. Logs exit (ok/error, duration, output summary).
5. Returns `Result<T>`.

Steps that already return `Result` (because they have expected failures) are passed through unchanged. The wrapper only catches the unexpected.

A lint rule flags `return error.message`, `return String(error)`, and bare `throw` of strings inside step files.

## 6. Function classes

Each step declares one class. The class sets its failure kinds and rules.

| Class | May do I/O | Expected non-error outcomes | Typical error kinds | Rules |
|---|---|---|---|---|
| `pure` (regex, parse, format, map, pricing math) | No | No match, empty input | `validation` | No logging inside the function, the wrapper logs. Table-driven unit tests. No match returns a typed value (`null` or `{ matched: false }`), not an error, unless the strip requires a match. |
| `api` (outbound HTTP) | Yes | None | `network`, `upstream`, `unauthorized`, `rate_limited`, `validation` | Timeout required. Response parsed with a schema before use. HTTP status mapped to `kind`. Retry only if `retryable`. |
| `db` | Yes | Zero rows on a list query | `not_found`, `conflict`, `network`, `unexpected` | Uses a repository port only. Distinguishes "no rows" from "query failed". Declares what it reads and writes (section 7). |
| `cache` / `memory` | Maybe | Miss, stale | `validation` (corrupt entry) | A miss is a normal value, `{ hit: false }`, never an error. A corrupt or outdated entry is treated as a miss (section 12). |
| `storage` (object storage, browser storage) | Yes | Missing object | `not_found`, `forbidden`, `network` | Scoped to a prefix declared in the manifest. Browser storage follows section 12. |
| `ui` (handlers, form logic) | No | Invalid user input | `validation` | Mostly produces `audience: "user"` errors. Kept free of data fetching, which belongs in strips. |
| `scrape` (optional, only for ingestion written inside the skeleton's runtime. Ingestion may instead be a separate program, see section 3) | Yes | Page unchanged | `network`, `rate_limited`, plus `blocked`, `source_changed`, `parse_failed` | Fetching and parsing are separate steps: fetch is `scrape`, parsing is `pure` and tested against saved page snapshots. Records the source URL and fetch time. |

Each step file starts with its manifest (section 7).

If a class is arguable, the rule of thumb is: if it does I/O, it is not `pure`.

## 7. Step manifest and permissions

Every step is declared with `defineStep()`, which requires a manifest.

```ts
export const findUserByEmail = defineStep({
  name: "db.user.findByEmail",
  class: "db",
  input: z.object({ email: z.string().email() }),
  output: UserSchema.nullable(),
  permissions: { reads: ["users"], writes: [], storage: [] },
  errors: ["network", "unexpected"],
  run: async (input, ctx) => ctx.ports.users.findByEmail(input.email),
});
```

Rules:

- **Input and output are schemas**, so they are checked at runtime and available to the catalog.
- **Permissions list exactly what the step touches**: tables or collections it reads and writes, and storage prefixes. Empty means none.
- **Capability injection.** `ctx.ports` gives the step only the ports its permissions allow. A step that declares `writes: []` receives a reader and has no write method to call. Reads and writes are separate ports (`UserReader`, `UserWriter`).
- **Prefer narrow steps** (`db.user.setDisplayName`) over generic ones (`db.user.update(anyFields)`). When no existing step matches exactly, create a new narrow step.
- **Never widen an existing step.** Changing a step's permissions, input, or output changes every strip that uses it. The conformance check compares manifests with the committed catalog and fails on a widened permission (section 15).

## 8. Strip definition

Each strip is defined in one file that lists its steps, permission budget, and routing. The file is the documentation.

```ts
export const saveProfileStrip = defineStrip({
  name: "profile.save",
  budget: { reads: ["users"], writes: ["users"], storage: [] },
  steps: [
    parseProfileForm,   // pure.profile.parseForm
    readProfileCache,   // cache.profile.read
    updateDisplayName,  // db.user.setDisplayName
    notifyApi,          // api.notify.profileChanged, optional
  ],
  invalidates: ["profile:{userId}"],
  routing: {
    "pure.profile.parseForm":    { validation: "toast" },
    "db.user.setDisplayName":    { conflict: "toast", not_found: "abort", network: "retry:2" },
    "api.notify.profileChanged": { "*": "log-and-continue" },
    "*": "abort",
  },
});
```

`defineStrip()` fails the typecheck or the conformance check when:

- a step's output type does not match the next step's input type,
- the combined permissions of the steps exceed `budget`,
- a step has no routing entry and there is no `"*"` entry,
- a write step exists and `invalidates` is missing (an empty list must be written explicitly),
- two steps or strips share a name.

Routing actions:

- `toast`: send to the user receiver (only if `audience: "user"`, otherwise it is downgraded to the generic message with the stripId as a reference).
- `retry:n`: retry if `retryable`, up to n times.
- `abort`: stop the strip, return the error to its receiver.
- `log-and-continue`: record and move on (for optional steps).
- `recover:<stepName>`: run a fallback step (for example a cache miss falls through to DB).

Each strip file also records:

- **Trigger and end states**: success value, user error, internal error.
- **Side-effect boundary**: which steps write, and what state is left behind if a later step fails.

## 9. Registry, naming, and catalog

- **Step names**: `<class>.<domain>.<verb>`, for example `db.user.findByEmail`. **Strip names**: `<domain>.<verb>`, for example `profile.save`.
- Names are unique. The conformance script fails on duplicates.
- The script also warns on near-duplicates (names that match after removing common verbs and casing, such as `getUser` and `fetchUser`). This is a heuristic and will miss some.
- **Catalog**: the script generates `docs/generated/catalog.md`, one line per step (name, class, input, output, permissions, used by) and one per strip. Nobody edits it by hand. CI regenerates it and fails on a diff, so it cannot drift.
- Keep catalog lines compact. The catalog is referenced from steering (section 15), and steering has a size budget.
- Before creating or reusing a step, read the catalog.

## 10. Reuse rules

A step may be used in another strip only if:

1. It depends on its typed input and the context (`stripId`, `log`, its allowed ports) and nothing else. No hidden shared state.
2. Its manifest matches what the new strip needs: same input, same output, and permissions within the new strip's budget.
3. It does not decide audience or presentation beyond a default. The strip's routing table does.
4. It lives in a shared location (`steps/<class>/`), not inside one strip's folder.

If the manifest does not match, create a new step. Do not edit the existing one. Strip-specific glue (reshaping one step's output for the next) is a separate `pure` step.

## 11. Ports and adapters

The rules that keep steps independent of one provider (details and per-port decisions are in `provider-ports.md`):

- **Ports are written in domain terms.** `users.findByEmail(email): User | null`, not `query(sql)`. Inputs and outputs are domain types, never rows or driver objects.
- **Import boundary.** Provider SDKs, drivers, SQL, and query builders may be imported only inside `adapters/<port>/<provider>/`. A lint rule (`no-restricted-imports`) enforces it.
- **Port semantics are written down**: ID format, timestamp format, how not-found is reported, pagination style, case sensitivity, and how atomic multi-write operations are expressed. These are the points where providers differ and where steps end up shaped to one of them.
- **Shape ports to the weakest provider.** If a provider cannot do interactive transactions, the port expresses atomic writes as a batch of operations, which every provider can run.
- **Two adapters from the start.** Every port has a real adapter and an in-memory adapter. A port with one implementation is probably shaped to it.
- **Contract tests.** One test suite per port, run against every adapter, covering the port's documented semantics and its error mapping.
- **Error mapping table.** Each adapter has a table from provider errors to `ErrorKind`, tested.
- **Provider-specific features** go in a separate, clearly marked optional port, not into the main port.
- **Configuration chooses the adapter.** Steps never import an adapter.

## 12. Cache and browser storage rules

- **A cache is never the source of truth.** Turning it off is a valid configuration, and a `NullCache` adapter exists. CI runs the strip tests with the cache on and with it off.
- **Every entry is a versioned envelope**: `{ schemaVersion, storedAt, ttl, value }`.
- **Corrupt or outdated entries are misses.** On read, parse the value with its schema. If parsing fails or the version differs, delete the entry, return `{ hit: false }`, and log at debug level. Do not return an error, and do not pass the raw value through.
- **Keys are namespaced** with app, adapter, and schema version, so switching providers or versions cannot read the old entries.
- **Invalidation is declared** in the strip (`invalidates`, section 8), and the strip's tests check that a write invalidates the listed keys.
- **Eventual consistency.** Some cache providers are eventually consistent. For example, OpenNext's documentation says Workers KV updates can take up to about 60 seconds to appear globally. Anything that needs accuracy (rate-limit counters, order state, balances) does not live in an eventually consistent cache.
- **Browser storage** uses the same envelope through one wrapper. Keys include the user ID. Storage is cleared on logout and on a schema version change.
- **Do not read browser storage during server rendering or before hydration completes.** A value that differs between server and client output causes hydration mismatches and forced refreshes.

## 13. Logging

The logger is a port. Steps never call `console`.

- A lint rule (`no-console`) applies to all source folders. The only exception is the logger adapter, because some runtimes (Workers, for example) collect `console` output as their log stream.
- Log entry shape (JSON, one per step event):

```ts
{ stripId, step, class, phase: "start" | "end", source?, ok?, ms?, input?, output?, error? }
```

- `source` of input: `"cache" | "db" | "api" | "memory" | "prev-step" | "user"`.
- **Development**: log full input and output. Keep entries in memory and print as a grouped trace per stripId.
- **Production**: log step, class, stripId, source, duration, error kind. Redact or omit payloads. Sampling is optional.
- Pass `stripId` to outbound API calls (header) and into DB query comments if supported, so logs from other systems line up.
- Receivers show users the `stripId` as a reference code on generic errors.

## 14. Storybook and UI development

The aim is to preview every UI state without running the app, database, or APIs.

- **UI components receive data and `Result`-shaped props**, not strips. Strips are called from page or container code, so presentational components stay free of server logic.
- **One story per strip end state** for each component that consumes a strip: loading, success, `user` error, `internal` error (generic message plus reference code), and empty.
- **Toast receiver stories**: user error with message, internal error with reference ID, and long messages.
- **Fixtures**: keep typed fixtures such as `okResult(value)` and `errResult(kind, audience)` in a shared test-utils file, used by stories and unit tests.
- **Mock strips in stories** by passing a function that returns a canned `Result`, not by mocking the network.
- **Low-spec machine**: prefer a Vite-based Storybook builder if the version you install supports Next.js that way (check current Storybook docs). Run unit tests for `pure` steps with a plain test runner (Vitest) in Node, with no browser. Run Storybook only for the UI you are changing.

## 15. Enforcement and agent guardrails

Requirements the agent must not skip are enforced by checks that list every violation. Instructions alone get lost when long jobs fill the context or get compacted.

**Conformance script** (`scripts/check-conformance`). It scans the code and prints every violation, then exits non-zero. Checks:

1. Every step is created with `defineStep()`, has a manifest, and follows the naming format.
2. Step and strip names are unique. Near-duplicate names produce warnings.
3. No `console` outside the logger adapter.
4. No provider imports outside `adapters/<port>/<provider>/`.
5. No `return error.message`, `String(error)`, or string throws in step files.
6. Each strip passes the `defineStrip()` checks in section 8.
7. A step's permissions did not widen compared with the committed catalog.
8. The generated catalog is current.
9. Every port has at least two adapters and a contract test file.

The coverage checker (`scripts/check-coverage.mjs`) already exists for the app coverage files.

**Kiro setup** (to be written next, based on Kiro's documented behavior):

- `always` steering: a short file with the few rules that apply everywhere (never return errors as values, use the catalog, never widen a step).
- `fileMatch` steering per class, for example `src/steps/db/**` loads the db class rules, and `src/strips/**` loads the strip rules and references the generated catalog with `#[[file:docs/generated/catalog.md]]`.
- A `Stop` hook that runs typecheck, tests, and the conformance script, and exits non-zero while violations remain, so the agent keeps working from the list.
- A custom agent, if used, must list steering under `resources`, since custom agents do not load it automatically. Agent resources have a size budget (documented as 32 files and 100,000 characters in total), so steering files stay short.
- Hook trigger names and file-hook behavior need checking against the current docs when we write them. File hooks fire only for changes the agent makes, not for manual edits.

## 16. Suggested layout

```
src/
  steps/
    pure/
    api/
    db/
    cache/
    storage/
    ui/
    scrape/            # optional
  strips/
    profile.save.strip.ts
  ports/               # interfaces only, domain terms
  adapters/
    <port>/
      <provider>/      # the only place provider SDKs are imported
      memory/
      contract.test.ts
  lib/
    result.ts          # Result, StepError, helpers
    step.ts            # defineStep(), step() wrapper
    strip.ts           # defineStrip(), routing
    cache-envelope.ts
  components/
    Toast/
      Toast.tsx
      Toast.stories.tsx
  test-utils/
    fixtures.ts
scripts/
  check-conformance
  check-coverage.mjs
docs/
  function-strips-plan.md
  provider-ports.md
  app-parts-checklist.md
  app-coverage.template.md
  generated/
    catalog.md         # generated, do not edit
.kiro/
  steering/
  hooks/
```

## 17. Decisions

Decided:

1. **Own code** for `Result`, `defineStep()`, and `defineStrip()`. They are small, and this avoids a dependency.
2. **Strips run on the server only**, at first. The browser UI receives `Result`-shaped data as props, and calls strips through Server Actions or route handlers.
3. **Apps start from a GitHub template repository** (one copy per app). The skeleton keeps its core in separate folders (`lib/`, `ports/`, `adapters/`) so that it can be published as a package later if copying proves painful.
4. **Auth uses a library behind the `Auth` port.** Which library is chosen when the port is built.
5. **Skeleton scope.** First: items 1 to 9 and 48 to 50 of the checklist. Next: billing, entitlements, metering, and rate limits (items 10 to 13). Data ingestion and marketplace features stay in the apps until two apps need the same thing, and then they move into the skeleton.
6. **The database port has no raw query method.** Only named repository methods (`findByEmail`).

Still open (decide when building the part concerned):

- How strict lint enforcement is at first.
- Where production logs go (the platform's log collection, or a hosted service).
- How a deliberate permission widening is approved (a recorded acknowledgment file, or a review step).
- Timestamp representation at the database port.

## 18. Known costs

- Result chaining adds code unless `defineStrip()` handles it.
- Manifests, budgets, and routing tables are extra to write. They replace scattered try/catch, ad hoc permission checks, and guessing which step to reuse.
- Shaping ports to the weakest provider makes some operations more awkward than the provider's native feature.
- Two adapters per port means writing and maintaining both, plus the contract tests.
- Per-step logging has overhead, so payload logging is dev-only.
- Class boundaries and near-duplicate names are partly judgement calls, and the checks catch only the mechanical part.
