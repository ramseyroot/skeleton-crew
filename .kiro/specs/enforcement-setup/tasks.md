---
created: 2026-11-23
updated: 2026-11-23
---

# Implementation Plan: Enforcement Setup

All tasks are sequential and run by the main agent (change plan, CP1). Each task lists the files it writes and the requirements it covers. Each rule task includes its bad and good fixtures, its entry in `docs/conformance-rules.md`, and its registry entry, so the meta tests stay green after every task.

Checkpoints (CP3) stop for user review after tasks 4, 14, and 20.

Every task: append a `started` row to `progress.md` before writing files. On finish, tick the checkbox, append a `done` row, and commit the task's files with both, as `task(enforcement-setup/<id>): <title>`. `progress.md` and `tasks.md` are implicitly in every task's `Writes:`.

- [x] 1. Project setup and runtime check
  - Mode: sequential
  - Writes: package.json, pnpm-lock.yaml, tsconfig.json, .gitignore, .kiro/specs/enforcement-setup/design.md
  - Create `package.json` with `packageManager` set to pnpm, `typescript`, `ts-api` (TypeScript 6 alias, see design D1 revision), and `@types/node` as dev dependencies, and scripts `conformance`, `check`, `test:conformance`.
  - Create `tsconfig.json` (strict, `noEmit`, erasable syntax only, Node 24 module resolution).
  - Confirm Node 24 runs a `.ts` file directly with no flags and no disruptive warning. Record the result in design D2. If it fails, switch D2 to the `.mjs` fallback before continuing.
  - Add the `Writes:` glob note (CP4) to the design.
  - _Requirements: 10.3, 23.1_

- [x] 2. Configuration loading
  - Mode: sequential
  - Writes: conformance.config.json, conformance.exceptions.json, scripts/conformance/config.ts, scripts/conformance/test/config.test.ts
  - Write the config file from design D4, and an empty exceptions list.
  - Load and validate the config. A missing or invalid field exits with code 2 and names the field.
  - Tests: valid config, each missing required field, unknown field.
  - _Requirements: 1.6, 1.7, 2.4, 9.2_

- [x] 3. Runner, discovery, report, and exceptions
  - Mode: sequential
  - Writes: scripts/conformance/types.ts, scripts/conformance/project.ts, scripts/conformance/discover.ts, scripts/conformance/report.ts, scripts/conformance/exceptions.ts, scripts/conformance/cli.ts, scripts/conformance/rules/index.ts, scripts/conformance/test/report.test.ts, scripts/conformance/test/helpers.ts
  - Rule and violation types, the empty registry, and `not-applicable` handling by `needs`.
  - Build the TypeScript program over `sourceRoots`. Discover `defineStep()` and `defineStrip()` calls, ports, and adapters (design D3).
  - Report: stable sort, grouping, character cap, `report.json` and `report.md` in `.conformance/`, exit codes 0, 1, 2.
  - Exceptions: load, match by target or path, list active ones.
  - Flags: `--files`, `--strict`, `--json`.
  - Tests: ordering, cap, exit codes, `not-applicable`, exception matching, a rule that throws gives exit 2.
  - _Requirements: 1.1 to 1.9, 9.1, 9.2, 9.5, 10.5_

- [x] 4. Rules documentation and meta tests
  - Mode: sequential
  - Writes: docs/conformance-rules.md, scripts/conformance/test/meta.test.ts, scripts/conformance/test/rules.test.ts
  - Rules document with the entry format from the design and an intro.
  - Meta tests: every registered rule has `fixtures/<id>/bad`, `fixtures/<id>/good`, `expected.json`, and a docs section. Every docs section has a rule.
  - Fixture runner: runs each bad fixture and checks the expected violations, runs each good fixture and checks none for that rule.
  - **Checkpoint: user reviews the runner's output format and a sample run.**
  - _Requirements: 10.1, 10.2, 10.4, 15.1 to 15.3_

- [x] 5. Code pattern rules (R01 to R04)
  - Mode: sequential
  - Writes: scripts/conformance/rules/_ast.ts, scripts/conformance/rules/R01-no-console.ts, scripts/conformance/rules/R02-no-error-as-value.ts, scripts/conformance/rules/R03-provider-import-boundary.ts, scripts/conformance/rules/R04-no-raw-queries.ts, scripts/conformance/rules/index.ts, docs/conformance-rules.md, scripts/conformance/test/fixtures/R01/**, scripts/conformance/test/fixtures/R02/**, scripts/conformance/test/fixtures/R03/**, scripts/conformance/test/fixtures/R04/**
  - `rules/_ast.ts` (added during the work): shared parsing and import helpers for rules, so `types.ts` and `cli.ts` stay unchanged.
  - _Requirements: 2.1 to 2.5_

- [x] 6. Naming and step rules (R05 to R11)
  - Mode: sequential
  - Writes: scripts/conformance/rules/R05-step-name-format.ts, scripts/conformance/rules/R06-strip-name-format.ts, scripts/conformance/rules/R07-unique-names.ts, scripts/conformance/rules/R08-near-duplicate-names.ts, scripts/conformance/rules/R09-step-must-be-defined.ts, scripts/conformance/rules/R10-step-manifest-complete.ts, scripts/conformance/rules/R11-manifest-static.ts, scripts/conformance/rules/index.ts, docs/conformance-rules.md, scripts/conformance/test/fixtures/R05/**, scripts/conformance/test/fixtures/R06/**, scripts/conformance/test/fixtures/R07/**, scripts/conformance/test/fixtures/R08/**, scripts/conformance/test/fixtures/R09/**, scripts/conformance/test/fixtures/R10/**, scripts/conformance/test/fixtures/R11/**
  - The near-duplicate normalizer is a shared function, reused by R39 in task 13.
  - _Requirements: 3.1 to 3.6_

- [x] 7. Strip rules (R12 to R15)
  - Mode: sequential
  - Writes: scripts/conformance/rules/R12-strip-routing-complete.ts, scripts/conformance/rules/R13-strip-budget.ts, scripts/conformance/rules/R14-strip-invalidates.ts, scripts/conformance/rules/R15-strip-routing-unknown-step.ts, scripts/conformance/rules/index.ts, docs/conformance-rules.md, scripts/conformance/test/fixtures/R12/**, scripts/conformance/test/fixtures/R13/**, scripts/conformance/test/fixtures/R14/**, scripts/conformance/test/fixtures/R15/**
  - Resolve each strip's step identifiers to their `defineStep()` declarations through the type checker.
  - _Requirements: 4.1 to 4.4_

- [x] 8. Catalog and no-widening (R16, R17)
  - Mode: sequential
  - Writes: scripts/conformance/catalog.ts, scripts/conformance/git.ts, scripts/conformance/rules/R16-catalog-current.ts, scripts/conformance/rules/R17-no-widening.ts, scripts/conformance/rules/index.ts, scripts/conformance/cli.ts, docs/conformance-rules.md, docs/generated/catalog.md, docs/generated/catalog.json, scripts/conformance/test/fixtures/R16/**, scripts/conformance/test/fixtures/R17/**, scripts/conformance/test/catalog.test.ts, scripts/conformance/test/rules.test.ts
  - Generate `catalog.md` (lines of at most 120 characters) and `catalog.json`, in stable order. Add `--write-catalog`.
  - Git helpers: read a file at `HEAD`, list files at `HEAD`, tree fingerprint. R17 fixtures create a temporary git repository.
  - Generate the (empty) catalog for this repository.
  - `rules.test.ts` (added during the work): fixtures may hold a `git-base/` folder, committed first, so rules that compare with git `HEAD` can be tested.
  - _Requirements: 5.1 to 5.6_

- [x] 9. Port and adapter rules (R18 to R22)
  - Mode: sequential
  - Writes: scripts/conformance/rules/R18-port-two-adapters.ts, scripts/conformance/rules/R19-port-contract-test.ts, scripts/conformance/rules/R20-adapter-runs-contract.ts, scripts/conformance/rules/R21-adapter-error-map.ts, scripts/conformance/rules/R22-port-domain-types.ts, scripts/conformance/rules/index.ts, docs/conformance-rules.md, scripts/conformance/test/fixtures/R18/**, scripts/conformance/test/fixtures/R19/**, scripts/conformance/test/fixtures/R20/**, scripts/conformance/test/fixtures/R21/**, scripts/conformance/test/fixtures/R22/**, package.json
  - `package.json` (added during the work): the test command must not pick up `.test.ts` files inside fixtures, which adapter fixtures need.
  - _Requirements: 6.1 to 6.5_

- [x] 10. Environment rules (R23 to R27)
  - Mode: sequential
  - Writes: scripts/conformance/rules/R23-profile-valid.ts, scripts/conformance/rules/R24-local-hosts-only.ts, scripts/conformance/rules/R25-profile-adapter-registered.ts, scripts/conformance/rules/R26-no-prod-secrets-outside-prod.ts, scripts/conformance/rules/R27-destructive-script-guard.ts, scripts/conformance/rules/index.ts, docs/conformance-rules.md, scripts/conformance/test/fixtures/R23/**, scripts/conformance/test/fixtures/R24/**, scripts/conformance/test/fixtures/R25/**, scripts/conformance/test/fixtures/R26/**, scripts/conformance/test/fixtures/R27/**, .gitignore
  - `.gitignore` (added during the work): R26 fixtures contain `.env` files, which the ignore rules would otherwise leave out of git.
  - R23 loads the profiles module, which is project code. Its fixtures use a minimal profiles file and schema without dependencies.
  - _Requirements: 7.1 to 7.5_

- [x] 11. Coverage, exceptions, and steering rules (R28 to R31)
  - Mode: sequential
  - Writes: scripts/conformance/rules/R28-coverage-valid.ts, scripts/conformance/rules/R29-exception-valid.ts, scripts/conformance/rules/R30-exception-unused.ts, scripts/conformance/rules/R31-steering-size.ts, scripts/conformance/rules/index.ts, docs/conformance-rules.md, scripts/conformance/test/fixtures/R28/**, scripts/conformance/test/fixtures/R29/**, scripts/conformance/test/fixtures/R30/**, scripts/conformance/test/fixtures/R31/**, scripts/check-coverage.mjs
  - `scripts/check-coverage.mjs` (added during the work): gains a `--root` option, so it resolves `planned` paths against the project being checked rather than its own location.
  - R28 runs the existing `scripts/check-coverage.mjs` and maps its output.
  - _Requirements: 8.1 to 8.3, 9.3, 9.4, 14.5_

- [x] 12. Change plan rules (R32, R33, R37)
  - Mode: sequential
  - Writes: scripts/conformance/plans.ts, scripts/conformance/rules/R32-plan-reuse-matches.ts, scripts/conformance/rules/R33-plan-impact-complete.ts, scripts/conformance/rules/R37-change-in-plan.ts, scripts/conformance/rules/index.ts, docs/conformance-rules.md, scripts/conformance/test/fixtures/R32/**, scripts/conformance/test/fixtures/R33/**, scripts/conformance/test/fixtures/R37/**, scripts/conformance/test/plans.test.ts, scripts/conformance/report.ts, scripts/conformance/cli.ts
  - `report.ts` and `cli.ts` (added during the work): the per-plan report section needs a place in the report.
  - Parse `change-plan.md` front matter and tables, read at `HEAD` only for permissions.
  - Report section per active plan: files changed, files planned but unchanged, plan commits with author and time.
  - _Requirements: 16.1 to 16.8, 20.1 to 20.3_

- [x] 13. Task file and plan comparison rules (R34 to R36, R38, R39)
  - Mode: sequential
  - Writes: scripts/conformance/tasks.ts, scripts/conformance/rules/R34-tasks-write-declared.ts, scripts/conformance/rules/R35-tasks-write-disjoint.ts, scripts/conformance/rules/R36-parallel-new-files-only.ts, scripts/conformance/rules/R38-plan-shared-new-once.ts, scripts/conformance/rules/R39-plan-no-near-duplicates.ts, scripts/conformance/rules/index.ts, docs/conformance-rules.md, scripts/conformance/test/fixtures/R34/**, scripts/conformance/test/fixtures/R35/**, scripts/conformance/test/fixtures/R36/**, scripts/conformance/test/fixtures/R38/**, scripts/conformance/test/fixtures/R39/**, scripts/conformance/test/tasks.test.ts
  - Parse incomplete tasks, `Mode:` and `Writes:` lines, including `/**` folder entries (CP4).
  - _Requirements: 17.1, 17.2, 18.1 to 18.4, 22.1 to 22.3_

- [x] 14. Progress and date rules (R40, R41)
  - Mode: sequential
  - Writes: scripts/conformance/progress.ts, scripts/conformance/rules/R40-progress-consistent.ts, scripts/conformance/rules/R41-docs-dated.ts, scripts/conformance/rules/index.ts, docs/conformance-rules.md, scripts/conformance/test/fixtures/R40/**, scripts/conformance/test/fixtures/R41/**, scripts/conformance/test/progress.test.ts, scripts/conformance/report.ts
  - `report.ts` (fixed during the checkpoint run): with many rules failing, the console summary shrank to counts only. It now keeps at least one violation per rule and shows the docs link once per rule.
  - Parse `progress.md`, resolve `this` commits, check against `tasks.md` and git.
  - **Checkpoint: user reviews the full rule set and a run over the fixtures.**
  - _Requirements: 26.6, 27.1 to 27.4_

- [x] 15. Check command
  - Mode: sequential
  - Writes: scripts/conformance/check.ts, scripts/conformance/test/check.test.ts, package.json, scripts/conformance/files.ts, scripts/conformance/project.ts, scripts/conformance/git.ts, scripts/conformance/plans.ts, scripts/conformance/tasks.ts, scripts/conformance/progress.ts, scripts/conformance/cli.ts, conformance.config.json
  - Speed work (added during the work, after the user asked about slow dev cycles): file helpers moved to `files.ts` so the hooks do not load the compiler; git results cached during one run; typecheck runs `tsc` directly instead of through pnpm.
  - Runs conformance, typecheck, configured tests, and affected strip tests from active plans. Prints `not configured` where a check is missing, and treats missing affected-test configuration as a failure.
  - _Requirements: 11.1 to 11.4, 17.4, 17.5_

- [x] 16. Worktree command
  - Mode: sequential
  - Writes: scripts/conformance/worktree.ts, scripts/conformance/test/worktree.test.ts, package.json, scripts/conformance/rules/R36-parallel-new-files-only.ts, docs/conformance-rules.md
  - R36 (changed during the work): it judged "existing" against HEAD, so a task's own new files failed it inside its worktree and after merging. It now uses the commit that last changed the task list.
  - `create`, `verify`, `merge`, `remove`, `list`, per the design, with the parallel limit and task-order merging.
  - Tests in temporary git repositories: out-of-list file fails verify, merge conflict aborts cleanly, failed post-merge check restores the previous commit, remove refuses unmerged work.
  - _Requirements: 23.2 to 23.9_

- [x] 17. Stop hook script
  - Mode: sequential
  - Writes: scripts/conformance/hooks/stop.ts, scripts/conformance/test/hooks-stop.test.ts
  - Unchanged-tree skip, check command run, block decision with capped reason, loop counter (block, block, final block, allow), reset on pass, crash log.
  - _Requirements: 12.1, 12.2, 13.1 to 13.4_

- [x] 18. Protection hook script
  - Mode: sequential
  - Writes: scripts/conformance/hooks/protect.ts, scripts/conformance/test/hooks-protect.test.ts
  - Protected files with unlock expiry, guarded existing files against active committed plans, worktree path handling and task file lists, main-tree block while worktrees are open, shell command patterns.
  - _Requirements: 12.3 to 12.5, 19.1 to 19.5, 24.1 to 24.3_

- [x] 19. Steering files
  - Mode: sequential
  - Writes: .kiro/steering/core-rules.md, .kiro/steering/steps-pure.md, .kiro/steering/steps-api.md, .kiro/steering/steps-db.md, .kiro/steering/steps-cache.md, .kiro/steering/steps-storage.md, .kiro/steering/steps-ui.md, .kiro/steering/steps-scrape.md, .kiro/steering/strips.md, .kiro/steering/ports-adapters.md, .kiro/steering/environments.md
  - Within the size limits (checked by R31). Each states which rules the check command enforces. `core-rules.md` includes the change process summary, the resume procedure, and points to `docs/change-process.md`.
  - _Requirements: 14.1 to 14.7, 21.2, 26.7_

- [x] 20. Self-check on this repository
  - Mode: sequential
  - Writes: docs/generated/catalog.md, docs/generated/catalog.json
  - Run the full check command on this repository, including this spec's `tasks.md` and `change-plan.md`. Fix any finding in the task that introduced it.
  - Confirm `pnpm test:conformance` passes offline.
  - **Checkpoint: user reviews results before hooks are enabled.**
  - _Requirements: 1.1, 10.3_

- [x] 21. Enable hooks
  - Mode: sequential
  - Writes: .kiro/hooks/enforcement.json
  - Stop hook, protection hook for `write`, protection hook for `shell`, as in the design. After this task, protected files need the unlock file.
  - Added during the work: a `UserPromptSubmit` hook running `stop.ts --reset`, so each new user message gives fresh attempts (built in task 17).
  - _Requirements: 12.1, 12.3, 12.6_

- [x] 22. Live test session with the user
  - Mode: sequential
  - Writes: docs/change-process.md
  - In a Kiro CLI session: trigger a violation and confirm the agent is sent back with the list, confirm a protected write is blocked, confirm the unlock works and expires.
  - Record the Stop event fields and the name of the reason field.
  - Test a sub-agent: whether it can be confined to a worktree, whether it triggers the Stop hook, what the hook events contain.
  - Write the results into `docs/change-process.md`. Adjust the hooks if the reason field name differs (with the unlock file).
  - _Requirements: 25.1 to 25.3_

- [ ] 23. Update status
  - Mode: sequential
  - Writes: docs/README.md
  - Mark the enforcement setup done, list how to run the checks, how to unlock, and how to resume unfinished work.
  - _Requirements: 12.6_
