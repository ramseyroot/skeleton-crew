---
status: draft
---

# Change Plan: Enforcement Setup

This spec builds the enforcement tooling itself, so the tooling that would check this plan does not exist yet. The plan follows `docs/change-process.md` anyway, so the format is exercised from the first spec.

## Strips in this spec

None. This spec adds tooling, not app features.

## Steps

None. No `defineStep()` steps are created, reused, or modified.

## Existing files to edit

No file in the guarded folders (`src/steps`, `src/strips`, `src/ports`, `src/adapters`, `src/lib`) exists yet, and none is created by this spec.

Existing files outside the guarded folders that tasks will edit:

| File | Task | Reason |
|---|---|---|
| .gitignore | 1 | Confirm entries for `node_modules/`, `.conformance/`, `.worktrees/` (already present; edited only if pnpm adds needs) |
| .kiro/specs/enforcement-setup/design.md | 1 | Record the result of the Node type-stripping check (decision D2) |
| docs/change-process.md | 21 | Record the results of the sub-agent and hook tests |
| docs/README.md | 22 | Update status |

## New files

Created by the tasks, listed in each task's `Writes:` line in `tasks.md`:

- `package.json`, `pnpm-lock.yaml`, `tsconfig.json`
- `conformance.config.json`, `conformance.exceptions.json`
- `scripts/conformance/**` (script, rules, hooks, worktree command, tests, fixtures)
- `docs/conformance-rules.md`
- `docs/generated/catalog.md`, `docs/generated/catalog.json`
- `.kiro/steering/*.md`
- `.kiro/hooks/enforcement.json`

## Affected strip tests

None.

## Execution mode

All tasks are `sequential` and run by the main agent, one at a time:

- The worktree command and the task-file rules are built by this spec, so the parallel phase is not available yet.
- Most rule tasks add an entry to the shared rule registry (`scripts/conformance/rules/index.ts`) and to `docs/conformance-rules.md`, so they edit files that earlier tasks created.

## Decisions

| ID | Topic | Decision | Status | Reason |
|---|---|---|---|---|
| CP1 | Execution | All tasks sequential, main agent only | proposed | Parallel tooling does not exist until this spec is done, and rule tasks share the registry and rules doc |
| CP2 | Network | Task 1 installs `typescript` and `@types/node` with pnpm, which needs network once. Everything after runs offline | proposed | The only dependencies of the design |
| CP3 | Checkpoints | Stop for user review after tasks 4, 13, and 19, and before enabling hooks (task 20) | proposed | Review the runner's shape early, the rule set when complete, and the self-check before hooks start blocking |
| CP4 | `Writes:` globs | A `Writes:` entry may be a file path or a folder ending in `/**` (used for fixture folders) | proposed | Fixtures are many small files. The design is updated in task 1 to say so |
