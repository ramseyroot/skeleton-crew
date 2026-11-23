---
created: 2026-11-23
updated: 2026-11-23
---

# Conformance Rules

Every rule checked by the conformance script has one section here. Violation messages end with a pointer to their section, for example `see docs/conformance-rules.md#r01-no-console`.

How to run:

- `pnpm conformance`: all rules, summary in the console, full report in `.conformance/report.md`.
- `pnpm conformance --files a.ts,b.ts`: rules tied to single files report only those files. Rules that look across files still check the whole project.
- `pnpm conformance --strict`: warnings also fail.
- `pnpm test:conformance`: the script's own tests.

Exit codes: `0` passed (warnings allowed), `1` errors found (or warnings with `--strict`), `2` the script itself failed (bad config, parse error, a rule crashed). A script failure is never reported as a pass.

A rule whose project parts do not exist yet (for example no `src/steps` folder, or no git repository) is listed as **not applicable**. Not applicable means not checked, not passed.

Exceptions: there are no inline disable comments. A violation can only be excepted by an entry in `conformance.exceptions.json` with the rule, the target (a step or strip name, a file path, or a glob), a reason, and a date. That file is protected: the agent cannot edit it without the user's unlock.

## Section format

Each rule section has this shape, and the meta tests check that every label is present:

```markdown
## R00 rule-name

- **Severity:** error or warning
- **Catches:** what the rule detects
- **Why:** the problem it prevents
- **Failing example:** code that triggers it
- **Passing example:** code that does not
- **Fix:** what to change
- **Limits:** for heuristic rules, what it can miss or flag wrongly (optional for exact rules)
```

## Rules

## R01 no-console

- **Severity:** error
- **Catches:** any use of `console` outside the logger adapter folder (`folders.loggerAdapter`).
- **Why:** console output in production is unstructured, unredacted, and has no stripId. Logging goes through the Logger port, whose adapter is the only code that writes to the console.
- **Failing example:** `console.log("saved", user)` in a step.
- **Passing example:** `ctx.log({ step: "db.user.save", phase: "end", ok: true })`.
- **Fix:** use the Logger port. If you are writing the logger adapter, put the file in the logger adapter folder.

## R02 no-error-as-value

- **Severity:** error
- **Catches:** in steps, strips, and adapters, a `return` inside a `catch` block that returns the caught error or its text (`e`, `e.message`, `e.stack`, `String(e)`, `e.toString()`, or `${e}` in a template), unless the returned value is a Result error object (`{ ok: false, ... }`). Anywhere: `throw` of a string or template.
- **Why:** an error returned as a plain value looks like real output to the next step. This is the "error string passed on as output" bug.
- **Failing example:** `catch (e) { return { ok: true, value: (e as Error).message }; }`
- **Passing example:** `catch (e) { return { ok: false, error: { kind: "unexpected", message: String(e) } }; }`
- **Fix:** return a Result error, or let the step wrapper catch the exception. Throw `Error` objects, never strings.
- **Limits:** pattern-based. It checks `return` statements in the catch block itself, not values passed to other functions or stored in variables first.

## R03 provider-import-boundary

- **Severity:** error
- **Catches:** an import (static, dynamic, or `require`) of a package on the `providerPackages` list from a file outside `adapters/<port>/<provider>/`. Files in the ports folder are reported by R22 instead.
- **Why:** a step that imports a driver or SDK is shaped to that provider, and switching providers means rewriting it.
- **Failing example:** `import PocketBase from "pocketbase";` in `src/steps/db/user.find.ts`.
- **Passing example:** the same import in `src/adapters/database/pocketbase/client.ts`.
- **Fix:** move the provider code into an adapter and call it through its port.
- **Limits:** only packages on the configured list are checked. Add new provider packages to `providerPackages`.

## R04 no-raw-queries

- **Severity:** error
- **Catches:** in steps and strips, string or template literals shaped like SQL statements (`SELECT cols FROM table`, `INSERT INTO`, `UPDATE table SET`, `DELETE FROM`, `WITH x AS (`, `CREATE TABLE`, `DROP TABLE`, `ALTER TABLE`), and templates tagged `sql`.
- **Why:** queries in steps tie them to one database engine. Queries belong inside repository adapters, behind named methods.
- **Failing example:** `const q = "SELECT id, name FROM users WHERE id = ?";` in a step.
- **Passing example:** `ctx.ports.users.findById(id)` in the step, and the SQL in `src/adapters/database/d1/users.ts`.
- **Fix:** add or use a named repository method and move the query into the adapter.
- **Limits:** pattern-based. Queries built from many string pieces, or query-builder calls, are not detected. Ordinary sentences are ignored only when they do not have a statement shape.

## R05 step-name-format

- **Severity:** error
- **Catches:** a step whose literal name does not match `<class>.<domain>.<verb>`, whose class is not in the configured `classes`, whose name starts with a different class than its `class` field, or whose file is not in `src/steps/<class>/`.
- **Why:** structured names keep similar steps apart and make the catalog searchable. The folder matches the class so class-specific steering loads for the right files.
- **Failing example:** `defineStep({ name: "user.find", class: "db" })`, or `name: "cache.user.find"` with `class: "db"`.
- **Passing example:** `defineStep({ name: "db.user.findByEmail", class: "db" })` in `src/steps/db/`.
- **Fix:** rename the step or move its file. If renaming an existing step, update the strips that use it (they are listed in the catalog).

## R06 strip-name-format

- **Severity:** error
- **Catches:** a strip whose literal name does not match `<domain>.<verb>`.
- **Why:** consistent names make strips easy to find in logs, the catalog, and change plans.
- **Failing example:** `defineStrip({ name: "Profile.save" })` or `name: "profile"`.
- **Passing example:** `defineStrip({ name: "profile.save" })`.
- **Fix:** rename the strip to lowercase-start `<domain>.<verb>`.

## R07 unique-names

- **Severity:** error
- **Catches:** two steps, or two strips, with the same name. Every location is reported.
- **Why:** names identify steps in logs, routing tables, and the catalog. A duplicate makes them ambiguous.
- **Failing example:** `db.user.find` defined in both `src/steps/db/a.ts` and `src/steps/db/b.ts`.
- **Passing example:** one definition per name.
- **Fix:** reuse the existing step if it matches exactly, or give the new one a distinct name.

## R08 near-duplicate-names

- **Severity:** warning
- **Catches:** names that become equal after splitting on dots and camelCase, lowercasing, and removing the verbs in `nearDuplicateVerbs` (get, fetch, load, read, find, retrieve, lookup, query).
- **Why:** `db.user.getByEmail` next to `db.user.findByEmail` usually means a step was rebuilt instead of reused.
- **Failing example:** `db.user.findByEmail` and `db.user.getByEmail`.
- **Passing example:** `db.user.findByEmail` and `db.user.findById`.
- **Fix:** reuse the existing step, or rename one so the difference is in the name. If both must exist, record an exception with the reason.
- **Limits:** heuristic. Steps doing the same job under unrelated names are not detected.

## R09 step-must-be-defined

- **Severity:** error
- **Catches:** in steps files (not tests), an exported value that is not created with `defineStep()`: plain constants, functions, classes, default exports, and `export { x }` of such values. Type exports and re-exports from other files are allowed.
- **Why:** a step that skips `defineStep()` has no manifest, so its permissions and contract cannot be checked or listed in the catalog.
- **Failing example:** `export function helper() { ... }` in `src/steps/db/user.ts`.
- **Passing example:** `export const findUser = defineStep({ ... })`, with helpers kept unexported or moved to `src/lib/`.
- **Fix:** wrap the step in `defineStep()`, or move non-step helpers out of the steps folder.

## R10 step-manifest-complete

- **Severity:** error
- **Catches:** a `defineStep()` call missing any of `name`, `class`, `input`, `output`, `permissions`, `errors`, or a `permissions` object missing `reads`, `writes`, or `storage`.
- **Why:** reuse decisions compare inputs, outputs, and permissions. A missing field makes the comparison impossible.
- **Failing example:** `defineStep({ name: "db.a.one", class: "db", input: In })`.
- **Passing example:** all six fields, with `permissions: { reads: ["users"], writes: [], storage: [] }`.
- **Fix:** add the missing fields. Use empty lists for permissions the step does not need.

## R11 manifest-static

- **Severity:** error
- **Catches:** manifest fields that must be literals but are not: for steps `name`, `class`, `permissions.*`, `errors`. For strips `name`, `budget.*`, `invalidates`, and `routing` keys and values. `input` and `output` may be any expression.
- **Why:** the script reads manifests without running code. A value held in a variable cannot be checked.
- **Failing example:** `const NAME = "db.a.one"; defineStep({ name: NAME, ... })`.
- **Passing example:** `defineStep({ name: "db.a.one", ... })`.
- **Fix:** write the value inline as a string or a list of strings.

## R12 strip-routing-complete

- **Severity:** error
- **Catches:** a strip with steps and no `routing` table, or a step with no routing entry when the table has no `"*"` entry. Also a step that cannot be resolved to its `defineStep()` declaration, since its routing cannot be checked.
- **Why:** every failure needs a decided route (toast, retry, abort, continue, recover). An unrouted step's errors would be handled by accident.
- **Failing example:** `routing: { "db.user.find": { network: "retry:2" } }` in a strip that also runs `db.user.save`.
- **Passing example:** an entry for each step, or `"*": "abort"` as the fallback.
- **Fix:** add the missing entries or a `"*"` entry. Import steps directly from their files so they resolve.

## R13 strip-budget

- **Severity:** error
- **Catches:** a strip with steps and no `budget`, or a step whose `reads`, `writes`, or `storage` permissions are not allowed by the strip's budget. Storage entries in the budget may be globs: `*` matches within one folder level and `**` any depth, so `avatars/**` allows a step scoped to `avatars/user-1/*`, and `avatars/*` does not. Also unresolved steps, since their permissions cannot be checked.
- **Why:** the budget is the strip's declared scope. A step with more access than the strip needs is how a strip quietly gains write access it should not have.
- **Failing example:** budget `writes: []` with a step that declares `writes: ["users"]`.
- **Passing example:** budget `writes: ["users"]`, or a narrower step that does not write.
- **Fix:** use or create a narrower step. Widen the budget only if the strip really needs it, and say so in the change plan.

## R14 strip-invalidates

- **Severity:** error
- **Catches:** a strip containing a step that writes, with no `invalidates` property.
- **Why:** writes make cached data stale. Declaring the affected keys, even as an empty list, forces the decision to be made.
- **Failing example:** `defineStrip({ name: "profile.save", steps: [findUser, saveUser] })`.
- **Passing example:** the same with `invalidates: ["profile:{userId}"]`, or `invalidates: []` when nothing cached is affected.
- **Fix:** add `invalidates` with the cache keys the writes affect.

## R15 strip-routing-unknown-step

- **Severity:** error
- **Catches:** a routing entry (other than `"*"`) that names a step not in the strip.
- **Why:** usually a typo or a leftover after a step was replaced, which leaves the real step routed by the fallback.
- **Failing example:** `routing: { "db.user.delete": { ... } }` in a strip without that step.
- **Passing example:** routing keys that match the strip's step names.
- **Fix:** correct or remove the entry.

## R16 catalog-current

- **Severity:** error
- **Catches:** `docs/generated/catalog.json` or `catalog.md` missing, or different from what the current code generates. Not applicable until a steps folder exists.
- **Why:** the catalog is what people and agents read before creating or reusing a step. A stale catalog leads to duplicates and wrong reuse.
- **Failing example:** a new step added without regenerating the catalog.
- **Passing example:** the catalog regenerated and committed together with the step.
- **Fix:** run `pnpm conformance --write-catalog` and commit both files. Never edit them by hand.

## R17 no-widening

- **Severity:** error
- **Catches:** a step whose permissions gained an entry, or whose `input` or `output` source text changed, compared with `docs/generated/catalog.json` at git `HEAD`. Removing permissions is allowed. New steps are not compared.
- **Why:** strips that already use the step rely on its contract. Widening it silently changes every one of them.
- **Failing example:** `db.user.find` changing from `writes: []` to `writes: ["users"]`.
- **Passing example:** a new step `db.user.save` with the write permission, leaving `db.user.find` as it was.
- **Fix:** create a new narrow step. If the change is really needed, list it as `modify` in the change plan and record an exception that the user approves.
- **Limits:** input and output are compared as source text, so renaming a schema variable also counts as a change. Until a catalog is committed, there is nothing to compare against.

## R18 port-two-adapters

- **Severity:** error
- **Catches:** a port file `src/ports/<port>.ts` with fewer than two adapter folders in `src/adapters/<port>/`.
- **Why:** a port implemented by one provider only is usually shaped to that provider. The in-memory adapter also serves tests, Storybook, and offline local mode.
- **Failing example:** `src/ports/users.ts` with only `src/adapters/users/memory/`.
- **Passing example:** `src/adapters/users/memory/` and `src/adapters/users/pocketbase/`.
- **Fix:** add the missing adapter. An in-memory adapter is the usual second one.

## R19 port-contract-test

- **Severity:** error
- **Catches:** a port with no shared contract suite at `src/adapters/<port>/contract.test.ts`.
- **Why:** one suite run against every adapter is what proves adapters behave the same, so switching providers does not change steps.
- **Failing example:** `src/ports/users.ts` with adapters but no `src/adapters/users/contract.test.ts`.
- **Passing example:** `contract.test.ts` exporting a function that takes an adapter factory and runs the port's cases.
- **Fix:** write the contract suite for the port's documented behavior and error mapping.

## R20 adapter-runs-contract

- **Severity:** error
- **Catches:** an adapter folder with no test file that imports `../contract.test.ts`.
- **Why:** an adapter that does not run the shared suite can drift from the port's contract unnoticed.
- **Failing example:** `src/adapters/users/d1/` with no test, or with tests that never call the contract suite.
- **Passing example:** `src/adapters/users/d1/d1.test.ts` that imports the suite and runs it with a D1 adapter factory.
- **Fix:** add a test in the adapter folder that runs the contract suite.

## R21 adapter-error-map

- **Severity:** error
- **Catches:** an adapter folder with no `errors.ts`.
- **Why:** every provider fails differently. The error map turns provider failures into the skeleton's `ErrorKind`s so steps and routing never see provider-specific errors.
- **Failing example:** `src/adapters/users/memory/` with only `index.ts`.
- **Passing example:** the same folder with `errors.ts` exporting the mapping table.
- **Fix:** add `errors.ts` with the mapping, and cover it in the contract suite.

## R22 port-domain-types

- **Severity:** error
- **Catches:** a file in the ports folder that imports a package on the `providerPackages` list.
- **Why:** a port signature with a provider type (rows, records, SDK responses) leaks that provider into every step that uses the port.
- **Failing example:** `import type { RecordModel } from "pocketbase";` in `src/ports/users.ts`.
- **Passing example:** the port returns `User` from the app's own types.
- **Fix:** define domain types and convert inside the adapter.
