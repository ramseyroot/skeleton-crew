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
