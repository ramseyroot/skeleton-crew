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
