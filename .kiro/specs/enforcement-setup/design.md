# Design Document: Enforcement Setup

## Overview

This design implements the requirements in `requirements.md`. It has four parts:

1. **Conformance script**: a Node program that loads the project with the TypeScript compiler API, runs a registry of rules, applies recorded exceptions, and writes a capped console summary plus a full report.
2. **Check command**: runs the conformance script, then the type checker, then the test suite, and returns one exit code.
3. **Hooks**: a `Stop` hook that runs the check command and sends the agent back to work on failure, with a loop limit, and a `PreToolUse` hook that blocks agent writes to protected files.
4. **Steering and rule docs**: short `always` and `fileMatch` steering files, and one rules document that every violation points to.

Environment facts this design relies on (checked during this stage):

- Node v24.19.0 and Kiro CLI 3.5.0 are installed. Git 2.47.3 is installed, but the workspace is not a git repository yet.
- Kiro hook facts from the current docs ([hook types](https://kiro.dev/docs/hooks/types.md), [hooks migration](https://kiro.dev/docs/cli/v3/hooks-migration.md)):
  - Standalone hook files use `{"version": "v1", "hooks": [...]}` with PascalCase triggers: `Stop`, `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `SessionStart`, `PreCompact`, `PostCompact`.
  - `Stop`: exit 0 with JSON `decision: "block"` on STDOUT starts another agent turn using the supplied reason. Exit 1 also continues. Other codes leave the turn finished. Stop hooks take no matcher.
  - `PreToolUse`: exit 2 blocks the tool call and returns STDERR to the agent. The matcher accepts category tags such as `write` and `shell`.
  - The event JSON arrives on STDIN, with `hook_event_name`, `cwd`, `session_id`, and for tool hooks `tool_name` and `tool_input`.
  - File hooks fire only for agent changes. Tool hooks fire only for agent tool calls, so manual edits are never affected (Requirement 12.5).
- Not stated precisely in the docs, to confirm in the first hook task: the exact field name for the Stop hook's reason (assumed `reason`), and the full Stop event fields.

## Architecture

```
            ┌────────────────────────────┐
 agent ───▶ │ PreToolUse hook (protect)  │──▶ exit 2 if a protected path is targeted
            └────────────────────────────┘
            ┌────────────────────────────┐
 agent ───▶ │ Stop hook                  │──▶ check command
 stops      │  skip if tree unchanged    │      ├─ conformance script ──▶ rules ──▶ exceptions ──▶ report
            │  loop counter per session  │      ├─ type checker (tsc --noEmit)
            └────────────────────────────┘      └─ test suite (configured command)
                     │
                     └──▶ decision: block + capped summary   or   allow stop
```

The rules only read code. They never modify files, except that the catalog rule writes `docs/generated/` when run with `--write-catalog`.

## Decisions (the five open points from requirements)

### D1. How the script reads code: TypeScript compiler API

| Option | For | Against |
|---|---|---|
| TypeScript compiler API | Already needed for type checking. Resolves imports and symbols, so a strip's step references can be followed to their `defineStep()` calls. One dependency. | Rules are more code than lint rules. No editor squiggles. |
| ESLint custom rules | Editor feedback, familiar | Per-file view, hard to check whole strips, budgets, and catalog. Adds a plugin and config. |
| Structural search tool (ast-grep and similar) | Short pattern rules | No type or symbol resolution. Extra binary. |

Chosen: the TypeScript compiler API (`typescript` as a dev dependency). ESLint can be added later for editor feedback on the simple rules, without replacing the script.

### D2. Language and runtime of the script

The script is written in TypeScript and run directly by Node's built-in type stripping (Node 24), with no build step and no extra runner. Only erasable syntax is used (no enums, namespaces, or parameter properties). Task 1 confirms that Node 24 runs the files without flags. If it requires a flag or prints a disruptive warning, the fallback is plain `.mjs` with JSDoc types, which changes no other part of the design.

The script's own tests use Node's built-in test runner (`node --test`), so they need no dependency and run offline.

### D3. Discovering steps and strips

Steps and strips are discovered by reading `defineStep({...})` and `defineStrip({...})` calls in the configured folders. Folder and filename conventions are checked as rules, not relied on for discovery.

For this to work without running project code, manifest fields that the rules read must be **static**: `name`, `class`, `permissions`, `errors`, `budget`, `invalidates`, and `routing` keys are literals. `input` and `output` may be any expression. The catalog records their source text, and type compatibility is left to the compiler. This adds one rule, `manifest-static` (R11), not listed in the requirements.

A strip's `steps` array holds identifiers. The script resolves each through the type checker to its declaration and reads that step's manifest.

### D4. Configuration file

One JSON file at the repository root, `conformance.config.json`. JSON keeps it readable by the hooks without loading TypeScript. Shape:

```json
{
  "sourceRoots": ["src"],
  "folders": {
    "steps": "src/steps",
    "strips": "src/strips",
    "ports": "src/ports",
    "adapters": "src/adapters",
    "loggerAdapter": "src/adapters/logger",
    "config": "src/config",
    "coverage": "docs/coverage"
  },
  "classes": ["pure", "api", "db", "cache", "storage", "ui", "scrape"],
  "providerPackages": ["pocketbase", "@supabase/*", "pg", "postgres", "drizzle-orm", "kysely", "@prisma/client", "stripe", "paystack*"],
  "nearDuplicateVerbs": ["get", "fetch", "load", "read", "find", "retrieve", "lookup", "query"],
  "prodSecretNames": [],
  "destructiveScripts": { "globs": ["scripts/db/seed*", "scripts/db/reset*", "scripts/db/migrate-down*"], "guardCall": "assertNotProd" },
  "output": { "maxChars": 3000, "maxPerRule": 5, "reportDir": ".conformance" },
  "checks": { "typecheck": "npx tsc --noEmit", "test": null, "testFiles": null },
  "stopHook": { "maxConsecutiveBlocks": 3, "skipIfUnchanged": true },
  "steering": { "alwaysMaxLines": 60, "otherMaxLines": 80 },
  "guardedFolders": ["src/steps", "src/strips", "src/ports", "src/adapters", "src/lib"],
  "specsFolder": ".kiro/specs",
  "protected": [
    "conformance.config.json",
    "conformance.exceptions.json",
    "scripts/conformance/rules/**",
    "scripts/conformance/hooks/**",
    ".kiro/hooks/**",
    ".kiro/steering/**",
    ".conformance/unlock"
  ]
}
```

`checks.testFiles` is a command template with `{files}` (for example `npx vitest run {files}`), used to run affected strip tests. `checks.test` and `checks.testFiles` are `null` until a test runner is set up, which makes the check command print `not configured` (Requirement 11.2).

### D5. Where reports and state live

`.conformance/` at the repository root, ignored by git:

- `report.json` and `report.md`: full results of the last run.
- `stop-state.json`: loop counter per session, and the fingerprint of the last passing tree.
- `unlock`: created by the user to allow edits to protected files (see Protection hook).

## Components

### File layout

```
conformance.config.json
conformance.exceptions.json
docs/
  conformance-rules.md          # one entry per rule
  generated/
    catalog.md                  # human and steering view
    catalog.json                # machine view, compared for no-widening
scripts/conformance/
  cli.ts                        # entry: flags, run, exit code
  check.ts                      # check command: conformance, typecheck, tests
  config.ts                     # load and validate conformance.config.json
  project.ts                    # build ts.Program, find files, resolve symbols
  discover.ts                   # extract steps, strips, ports, adapters
  exceptions.ts
  report.ts                     # sort, group, cap, write report files
  catalog.ts                    # generate catalog.md and catalog.json
  git.ts                        # read committed catalog.json, tree fingerprint
  rules/
    index.ts                    # registry: every rule is listed here
    R01-no-console.ts
    ...
  hooks/
    stop.ts
    protect.ts
  test/
    rules.test.ts               # fixture-driven tests for every rule
    meta.test.ts                # every rule has fixtures and a docs entry
    report.test.ts
    hooks.test.ts
    fixtures/<rule-id>/{bad,good}/   # small projects, plus expected.json
.kiro/
  steering/...
  hooks/enforcement.json
.conformance/                   # git-ignored
```

### Rule interface

```ts
export type Severity = "error" | "warning";
export type Needs = "steps" | "strips" | "ports" | "profiles" | "catalog" | "git" | "coverage" | "steering";

export type Violation = {
  rule: string;        // "R01"
  name: string;        // "no-console"
  severity: Severity;
  file: string;        // repo-relative
  line: number;
  message: string;     // one line
  target?: string;     // step or strip name, used for exception matching
};

export type Rule = {
  id: string;          // "R01"
  name: string;        // "no-console"
  severity: Severity;
  needs: Needs[];      // parts of the project the rule requires
  check(ctx: Context): Violation[];
};
```

`Context` holds the loaded config, the TypeScript program, the discovered steps, strips, ports, and adapters, and the list of files in scope. When a rule's `needs` are missing (for example no `src/steps` folder, or no git repository), the runner skips it and lists it as `not-applicable` (Requirement 10.5).

Every rule message ends with `see docs/conformance-rules.md#<id>-<name>` (Requirement 15.2).

### Rules

| ID | Name | Sev | Detection |
|---|---|---|---|
| R01 | no-console | error | Any `console.*` reference outside `folders.loggerAdapter` |
| R02 | no-error-as-value | error | In steps, strips, and adapters: inside a `catch` block, returning `<catchVar>.message`, `String(<catchVar>)`, or a template containing `<catchVar>`. Anywhere: `throw` of a string or template literal |
| R03 | provider-import-boundary | error | Import of a `providerPackages` entry from a file outside `adapters/<port>/<provider>/` |
| R04 | no-raw-queries | error | In steps and strips: string or template literals starting with `select`, `insert`, `update`, `delete`, or `with` followed by SQL keywords, and tagged templates named `sql`. Heuristic |
| R05 | step-name-format | error | `name` does not match `^<class>\.[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$`, or `class` is not in `classes`, or the name's class differs from `class`, or the file is outside `steps/<class>/` |
| R06 | strip-name-format | error | `name` does not match `^[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$` |
| R07 | unique-names | error | Two steps or two strips share a name. Both locations reported |
| R08 | near-duplicate-names | warning | Names equal after lowercasing, splitting on case and dots, and removing `nearDuplicateVerbs` |
| R09 | step-must-be-defined | error | A value export in `folders.steps` not initialized by a `defineStep()` call. Type-only exports are allowed |
| R10 | step-manifest-complete | error | `defineStep()` missing `name`, `class`, `input`, `output`, `permissions`, or `errors` |
| R11 | manifest-static | error | A static field (D3) is not a literal |
| R12 | strip-routing-complete | error | A step with no routing key and no `"*"` key |
| R13 | strip-budget | error | Union of step permissions not contained in `budget`. Names the step and the excess |
| R14 | strip-invalidates | error | A step has non-empty `writes` and the strip has no `invalidates` property |
| R15 | strip-routing-unknown-step | error | A routing key other than `"*"` that is not a step name in the strip |
| R16 | catalog-current | error | Generated catalog differs from `docs/generated/catalog.*` on disk |
| R17 | no-widening | error | A step in the generated catalog whose `permissions` grew, or whose `input` or `output` text changed, compared with `catalog.json` at git `HEAD`. Shows old and new |
| R18 | port-two-adapters | error | A port file `ports/<port>.ts` with fewer than two adapter folders in `adapters/<port>/` |
| R19 | port-contract-test | error | No `adapters/<port>/contract.test.ts` |
| R20 | adapter-runs-contract | error | No test file in the adapter folder imports `../contract.test` |
| R21 | adapter-error-map | error | No `errors.ts` in the adapter folder |
| R22 | port-domain-types | error | A file in `folders.ports` imports a `providerPackages` entry |
| R23 | profile-valid | error | Loading `src/config/profiles.ts` and parsing each profile with its exported schema fails |
| R24 | local-hosts-only | error | `local` profile has an allowed host other than `localhost`, `127.0.0.1`, `::1` |
| R25 | profile-adapter-registered | error | A profile names an adapter that has no folder under `adapters/<port>/` |
| R26 | no-prod-secrets-outside-prod | error | A `prodSecretNames` entry appears as a key in an `.env*` file whose name does not contain `prod` |
| R27 | destructive-script-guard | error | A file matching `destructiveScripts.globs` with no call to `guardCall` |
| R28 | coverage-valid | error, warning | Runs `scripts/check-coverage.mjs` on each file in `folders.coverage`. Its errors are errors, its gaps are warnings |
| R29 | exception-valid | error | An exception entry missing `rule`, `target`, `reason`, or `date`, or naming an unknown rule |
| R30 | exception-unused | warning | An exception that matched no violation |
| R31 | steering-size | error | A steering file over its line limit, or the steering folder over 100,000 characters |

Notes:

- R04, R08, and R02 are pattern heuristics. They will miss some cases. Their docs entries say so.
- R17 compares `input` and `output` by source text, so a pure rename of a schema variable also counts as a change. That is accepted: a change to a step's contract should be visible.
- R23 runs project code (the profiles module). It is the only rule that does. It is skipped when the file is missing.
- R17 needs a git repository with a committed catalog. Until then it is `not-applicable`.

### Change plans and task files

Facts this part relies on, from the Kiro docs ([specs](https://kiro.dev/docs/specs.md), [sub-agents](https://kiro.dev/docs/custom-agents/subagents.md)):

- Sub-agents share the workspace files. They have isolated conversations, not isolated folders.
- Kiro infers the dependency waves of spec tasks itself. No syntax to force tasks to run in sequence is documented.
- The docs do not say whether hook events identify a sub-agent, or whether sub-agents trigger the Stop hook.

So the design does not rely on agent identity or on Kiro's wave order. It relies on a committed plan, file existence in git, and the protection hook.

**`change-plan.md`** lives in the spec folder. The script parses its front matter and tables:

```markdown
---
status: active        # draft | active | done
---

## Steps

| Step | Action | Affected strips | Reason |
|---|---|---|---|
| db.user.findByEmail | reuse | | |
| db.user.setDisplayName | new | | |
| db.user.findById | modify | profile.view, orders.list | Return deletedAt for soft-deleted users |

## Existing files to edit

| File | Task | Reason |
|---|---|---|
| src/steps/db/user.findById.ts | 2 | modify entry above |
| src/strips/profile.view.strip.ts | 3 | uses the new field |

## Affected strip tests

- src/strips/profile.view.strip.test.ts
- src/strips/orders.list.strip.test.ts
```

- "Approved" means the version at git `HEAD` (read with `git show HEAD:<path>`). The working copy is ignored for permissions, so an agent's uncommitted edit grants nothing.
- Several plans can be `active` at once. Permissions are the union of their file lists.

**`tasks.md` notation.** Each task carries two plain sub-bullets, which Kiro shows as task detail:

```markdown
- [ ] 2. Modify db.user.findById to return deletedAt
  - Mode: sequential
  - Writes: src/steps/db/user.findById.ts, src/steps/db/user.findById.test.ts
- [ ] 4. Add db.user.setDisplayName step
  - Writes: src/steps/db/user.setDisplayName.ts, src/steps/db/user.setDisplayName.test.ts
```

Process rule (in `docs/change-process.md` and steering): `sequential` tasks are run one at a time by the main agent. Only tasks without `sequential` may be dispatched to sub-agents, and only after the task rules pass.

### Change rules

| ID | Name | Sev | Detection |
|---|---|---|---|
| R32 | plan-reuse-matches | error | A `reuse` step whose catalog entry (at `HEAD`) does not exist, or whose current input, output, or permissions differ from it |
| R33 | plan-impact-complete | error | A `modify` step whose "Affected strips" differ from the catalog's "used by" list, or whose affected strips' test files are not all listed |
| R34 | tasks-write-declared | error | A task in a `tasks.md` with no `Writes:` line |
| R35 | tasks-write-disjoint | error | Two non-sequential tasks in the same `tasks.md` list the same file |
| R36 | parallel-new-files-only | error | A non-sequential task lists a file that exists at `HEAD` |
| R37 | change-in-plan | error | A file under a guarded folder that exists at `HEAD` and differs in the working tree, not listed in any active committed plan |

R32, R33, R36, and R37 need git (`not-applicable` without it). Task rules only check incomplete tasks (`- [ ]`), so finished tasks do not keep failing.

For a `modify` entry that changes a step's contract, R17 `no-widening` still fails until an exception is recorded (Requirement 20.2). Changing a shared step's contract therefore always reaches the user twice: once in the plan review, once in the exceptions file, which only the user can unlock.

### Exceptions

`conformance.exceptions.json`:

```json
[
  { "rule": "R13", "target": "orders.cancel", "reason": "Refund writes payments, approved for v1", "date": "2026-11-23" }
]
```

`target` matches a violation's `target` (step or strip name) or its file path (exact or glob). A matched violation is moved from the failure list to the report's `exceptions` section. Inline disable comments are not recognized at all, so they cannot silence a rule (Requirement 9.1). The file is protected.

### Report and output

- Violations are sorted by rule ID, file, then line, so output is stable (Requirement 1.5).
- Console output: a header with totals, then one block per rule with its count and up to `maxPerRule` violations, then `not-applicable` rules, then active exceptions count. If the text exceeds `maxChars`, per-rule lists are shortened until it fits, and the last line points to `.conformance/report.md`.
- `report.json` holds everything, for the hooks and future CI.
- Exit codes: `0` clean or warnings only, `1` errors (or warnings in `--strict`), `2` the script itself failed (bad config, crash). A script failure is never reported as success.

Flags: `--files a.ts,b.ts` (Requirement 1.8; project-wide rules such as R07, R13, R16 still run on the whole project, because a single-file view would miss them), `--strict`, `--write-catalog`, `--json`.

### Check command

`node scripts/conformance/check.ts` runs, in order:

1. Conformance script.
2. `checks.typecheck`, if set and a `tsconfig.json` exists. Otherwise prints `typecheck: not configured`.
3. `checks.test`, if set. Otherwise prints `tests: not configured`.
4. `checks.testFiles` with the affected strip tests from all active committed change plans, if any exist. If plans list affected tests and `checks.testFiles` is not set, this is reported as `not configured` and counts as a failure, because a planned safety check would otherwise be skipped silently.

All of them run even if an earlier one fails, so the agent sees every problem at once. Each one's output is capped and the combined output stays under `maxChars`. Exit code is non-zero if any configured check fails. `not configured` never counts as passed: it is listed as such in the summary.

### Stop hook

`.kiro/hooks/enforcement.json` entry:

```json
{
  "name": "Run checks before finishing",
  "trigger": "Stop",
  "action": { "type": "command", "command": "node scripts/conformance/hooks/stop.ts" },
  "timeout": 300
}
```

Behavior of `stop.ts`:

1. Read the event from STDIN and take `session_id` (fall back to `"default"` if absent).
2. If `skipIfUnchanged` is on, compute a fingerprint of the working tree (git status and the content hash of changed files, or a hash of file paths and modification times when git is absent). If it equals the last passing fingerprint, exit 0. This keeps chat-only turns fast on a slow PC.
3. Run the check command.
4. On pass: reset the session's counter, store the fingerprint, exit 0.
5. On fail, increment the counter:
   - Counter below the limit: print `{"decision": "block", "reason": "<capped check output>"}` and exit 0. The agent starts another turn with the violations in front of it.
   - Counter equal to the limit: block one last time with this reason: stop fixing, report the remaining violations listed in `.conformance/report.md`, and say which decision is needed from the user.
   - Counter above the limit: exit 0 without a decision, so the agent can stop.
6. If the hook itself crashes, it exits with a code other than 0 and 1, which leaves the turn finished without forwarding output. The crash is written to `.conformance/stop-error.log`. This avoids an endless loop caused by a broken hook.

Timeout 300 seconds is an assumption for a slow PC. It is configurable in the hook file.

### Protection hook

```json
{
  "name": "Protect enforcement files",
  "trigger": "PreToolUse",
  "matcher": "write",
  "action": { "type": "command", "command": "node scripts/conformance/hooks/protect.ts" },
  "timeout": 10
},
{
  "name": "Protect enforcement files (shell)",
  "trigger": "PreToolUse",
  "matcher": "shell",
  "action": { "type": "command", "command": "node scripts/conformance/hooks/protect.ts --shell" },
  "timeout": 10
}
```

Behavior of `protect.ts`:

1. Read `tool_input` from STDIN. Collect every string value under keys that name paths (`path`, `file_path`, `paths`, `target`, `source`, `destination`), resolved against `cwd`.
2. With `--shell`, read `tool_input.command` and look for any protected path together with a write form: `>`, `>>`, `tee`, `sed -i`, `mv`, `cp`, `rm`, `truncate`, `git checkout --`, `git restore`.
3. If a protected path is targeted and `.conformance/unlock` does not exist or is older than 30 minutes, write a message to STDERR and exit 2. The message names the file and tells the agent to ask the user.
4. **Guarded existing files** (Requirement 19). If a targeted path is under `guardedFolders`, exists at git `HEAD`, and is not listed in any `active` change plan at `HEAD`, write a message to STDERR and exit 2. The message names the file, says it is not in the active change plan, and tells the agent to propose a plan change to the user. New files (not at `HEAD`) are allowed. The unlock file does not bypass this check: the way through is an updated, committed plan.
5. Otherwise exit 0.

The check reads plans and file existence from git, so it needs no knowledge of which agent or sub-agent is writing. To keep it fast, the hook caches the parsed plans keyed by the `HEAD` commit ID in `.conformance/`.

Unlocking for a deliberate change (confirmed by the user): the user runs `touch .conformance/unlock` in their own terminal. The unlock file is itself protected, so the agent cannot create it through its tools. It expires after 30 minutes.

Known limits, stated in the rules doc and README:

- The shell check is pattern-based. A determined or creative command can get past it. It is a guard against accidental edits, not a security boundary.
- The protection does not stop the user's own edits (by design).
- An agent could commit a plan change itself through the shell. The Stop hook does not prevent that. Plan commits are listed in the report with their author and time, and `docs/change-process.md` asks that only the user commits plan status changes. Isolating sub-agents in separate git worktrees would make this stronger, at the cost of a merge step per task. It is not part of this design.

Exit code 2 is used rather than the JSON `permissionDecision` form, because it works on every CLI V3 version and in the IDE.

### Steering files

| File | Inclusion | Contents |
|---|---|---|
| `core-rules.md` | `always` | The five rules in Requirement 14.1, the check command, the rule ID list with one line each, and a pointer to `docs/conformance-rules.md` |
| `steps-<class>.md` (7 files) | `fileMatch`, `src/steps/<class>/**` | The class row from plan section 6, the manifest template, the class checklist, and the rule IDs that apply |
| `strips.md` | `fileMatch`, `src/strips/**` | Strip template, routing actions, budget and invalidation rules, reuse rules, and `#[[file:docs/generated/catalog.md]]` |
| `ports-adapters.md` | `fileMatch`, `["src/ports/**", "src/adapters/**"]` | Port and adapter rules, contract test pattern, error map file |
| `environments.md` | `fileMatch`, `["src/config/**", "scripts/db/**", ".env*"]` | Profile rules, guard call, data separation rules |

Each file states which rules the check command enforces (Requirement 14.7). Sizes are checked by R31. The catalog is included only by `strips.md`, so it costs context only when strips are being worked on.

No custom agent is created. The default agent loads workspace steering. If a custom agent is added later, it must list `file://.kiro/steering/**/*.md` under `resources`.

### Rule documentation

`docs/conformance-rules.md` has one section per rule, with an anchor `<id>-<name>` (for example `#r01-no-console`), containing: severity, what it catches, why, a failing example, a passing example, how to fix, and known limits for heuristic rules.

## Testing strategy

- **Fixture tests** (`rules.test.ts`): for each rule, `fixtures/<rule-id>/bad/` is a small project that triggers the rule, with `expected.json` listing the expected violations (rule, file, line). `good/` must produce no violation for that rule. Each fixture includes its own minimal `conformance.config.json`.
- **Meta tests** (`meta.test.ts`): every rule in the registry has both fixture folders and a docs section, and every docs section corresponds to a rule (Requirements 10.4, 15.3).
- **Report tests**: stable ordering, the character cap, exit codes, `not-applicable` listing, and exception matching.
- **Change tests**: fixture repositories (created with `git init` inside a temporary folder during the test) with committed plans and catalogs, covering R32 to R37 and the guarded-file branch of `protect.ts`.
- **Hook tests**: `stop.ts` and `protect.ts` are run as child processes with sample event JSON on STDIN, checking exit codes, STDOUT JSON, the loop counter sequence (block, block, final block, allow), the unchanged-tree skip, and the unlock expiry.
- All tests run with `node --test`, offline.
- **Manual check** after enabling the hooks: one session in Kiro CLI that triggers a violation, confirms the agent is sent back, and confirms a protected write is blocked. This confirms the Stop reason field name.

## Error handling

The script follows the skeleton's own rule: its failures are never reported as success.

- Bad or missing config: exit 2 with the config error.
- A rule that throws: reported as a script failure for that rule (exit 2), with the rule ID. Other rules still run and are reported.
- Missing project parts: `not-applicable`, listed in the summary.
- Hook failures: logged to `.conformance/`, never loop.

## Prerequisites

- The workspace becomes a git repository (needed for R17 and the tree fingerprint). This is a task for you to approve, since it creates a repository.
- `package.json` with `typescript` as a dev dependency.
- `.gitignore` with `.conformance/` and `.env*` (except an example file).

## Requirement traceability

| Requirement | Covered by |
|---|---|
| 1 | cli.ts, report.ts, exit codes, flags |
| 2 | R01 to R04 |
| 3 | R05 to R11 |
| 4 | R12 to R15 |
| 5 | catalog.ts, R16, R17 |
| 6 | R18 to R22 |
| 7 | R23 to R27 |
| 8 | R28 |
| 9 | exceptions.ts, R29, R30, protected list |
| 10 | fixture and meta tests, `not-applicable` |
| 11 | check.ts |
| 12 | stop.ts, protect.ts, hook file, README section |
| 13 | stop.ts loop counter |
| 14 | steering files, R31 |
| 15 | conformance-rules.md, meta tests |
| 16 | change-plan.md format, R32, R33 |
| 17 | `sequential` notation, process rule, check command step 4 |
| 18 | `Writes:` notation, R34 to R36 |
| 19 | protect.ts step 4 |
| 20 | R37, R17 plus exceptions, report section per plan |
| 21 | docs/change-process.md, core-rules.md steering |

## Changes from the requirements

- Added rule R11 `manifest-static`, needed so that the script can read manifests without running code.
- Added R31 `steering-size`, so that Requirement 14.5 is checked continuously, not once.
- The `Writes:` and `Mode: sequential` lines are this project's notation, not Kiro syntax. Kiro treats them as task detail text.
- The Stop hook skips when the tree is unchanged since the last pass. This is not in the requirements. It keeps conversation-only turns from running the full check.
