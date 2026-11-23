---
status: draft
created: 2026-11-23
updated: 2026-11-23
---

# Change Plan: Skeleton Core

Format and rules: `docs/change-process.md` section 3. The catalog (`docs/generated/catalog.md`) was read: it lists no steps and no strips, so nothing can be reused or modified, and every step below is `new`.

## Strips in this spec

- profile.save
- profile.view

## Steps

Strips were compared with each other. No step is used by both strips, so no shared step needs its own earlier task (R38). No planned name is a near-duplicate of another planned name or of an existing step (R39).

| Step | Action | Used by (this spec) | Affected strips | Reason | Distinct from |
|---|---|---|---|---|---|
| pure.profile.parseForm | new | profile.save | | Validates and trims the form input | |
| db.user.setDisplayName | new | profile.save | | Writes one field of one user | |
| cache.profile.read | new | profile.view | | Reads one profile entry, a miss is a value | |
| db.user.findProfile | new | profile.view | | Returns the cached profile, or reads the user | |
| cache.profile.write | new | profile.view | | Stores one profile entry | |

## Existing files to edit

Added on 2026-11-23 (requirements 12 to 14, error reporter, metrics and the `dev` flag). Tasks 1 to 11 only created files in the guarded folders. Tasks 12 and 13 edit these existing guarded files, so this plan must be committed `active` before they start:

| File | Task | Reason |
|---|---|---|
| src/ports/logger.ts | 12 | Add the optional `data` field to `LogEntry` and keep it in `redact` (design D17) |
| src/adapters/logger/contract.test.ts | 12 | Add contract cases for `data` |
| src/lib/step.ts | 13 | Add `reporter` and `metrics` to `Ports`, and emit `step.duration_ms` |
| src/lib/strip.ts | 13 | Report final internal errors, emit `strip.runs` and `strip.duration_ms` |

Existing files outside the guarded folders that tasks will edit (task numbers match `tasks.md`):

| File | Task | Reason |
|---|---|---|
| package.json | 1 | Add dependencies and the test script (design section 8) |
| pnpm-lock.yaml | 1 | Updated by pnpm |
| tsconfig.json | 1 | Add `jsx`, `dom` types for the shell and stories (design section 1) |
| .gitignore | 1 | Add `.data/`, `.next/`, `storybook-static/` |
| conformance.config.json | 14 | Set `checks.test` (P9). Protected: the user must run `touch .conformance/unlock` first |
| docs/generated/catalog.md, docs/generated/catalog.json | 9 | Regenerated with `pnpm conformance --write-catalog` |
| docs/provider-ports.md | 14 | Record the timestamp decision and planned adapters |
| docs/function-strips-plan.md | 14 | Record the decisions on `uses` and cache permissions, and remove the timestamp item from "still open" |
| docs/environments.md | 14 | Record the `local`, `dev` and `prod` choices made in the skeleton |
| docs/README.md | 14 | Update status |
| docs/kiroween-script.md | each checkpoint | Build log entries and scene status |
| src/config/profiles.ts, registry.ts, compose.ts and their tests | 13 | New adapter keys, gating rules, the `dev` flag (not in a guarded folder) |
| src/test-utils/ports.ts, tests/lib/step.test.ts, tests/lib/strip.test.ts | 13 | `Ports` has two more members |
| src/app/page.tsx | 13 | Show the `dev` flag in the footer |
| docs/today/** | 14 | The illustrated page about what was built (new files) |

## New files

Created by the tasks, listed in each task's `Writes:` line in `tasks.md`:

- `src/lib/**`, `src/ports/**`, `src/adapters/**`, `src/config/**`
- `src/steps/**`, `src/strips/**` (five steps, two strips, and their tests)
- `src/ports/reporter.ts`, `src/ports/metrics.ts`, `src/adapters/reporter/**`, `src/adapters/metrics/**` (task 12)
- `src/components/**`, `src/test-utils/**`, `src/app/**`
- `.storybook/**`
- `.kiro/specs/skeleton-core/tasks.md`, `.kiro/specs/skeleton-core/progress.md`

## Affected strip tests

No strip or step is modified. Tasks 12 and 13 change library code that every strip runs through, so both strip test files run as affected tests:

- src/strips/profile.save.strip.test.ts
- src/strips/profile.view.strip.test.ts

## Execution mode

Final list in `tasks.md`:

- **Sequential**: tasks that edit existing files (1, 9, 12, 13, 14), and tasks that depend on earlier code. Tasks 12 and 13 are sequential because 12 edits `src/ports/logger.ts` and 13 edits `src/lib/step.ts` and `strip.ts`.
- **Parallel, in worktrees, at most 2 at once**: tasks 4 (database port) and 5 (cache and storage ports). They only create new files in separate folders, and start after tasks 1 to 3 are committed, because they need `Result`, the cache envelope, and the logger, clock and ID ports.

## Decisions

| ID | Topic | Decision | Status | Reason |
|---|---|---|---|---|
| CP1 | Execution | Tasks 4 and 5 (database, and cache with storage) run in parallel worktrees. All other tasks run sequentially | confirmed (user, 2026-11-23) | Port folders are disjoint new files, so parallel is safe. It also exercises the worktree command, which is good footage for the video. The cost is a heavier load on a low-spec PC, so the alternative is all sequential |
| CP2 | Catalog | The catalog is regenerated once, in task 9, after all steps and strips exist | confirmed (user, 2026-11-23) | Steps and strips only appear in task 9, so earlier regeneration would be empty. Steps and strips appear in task 9 |
| CP3 | Protected edit | `conformance.config.json` is edited in task 12 after you unlock, together with the `stop.ts` message fix | confirmed (user, 2026-11-23) | One unlock covers both. If you prefer, unlock earlier so that `pnpm check` runs the tests from task 2 on, which gives earlier feedback. The cost is more unlocks |
