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

No file in the guarded folders (`src/steps`, `src/strips`, `src/ports`, `src/adapters`, `src/lib`) exists yet, so this spec edits none of them. It creates all of them.

Existing files outside the guarded folders that tasks will edit (task numbers match `tasks.md`):

| File | Task | Reason |
|---|---|---|
| package.json | 1 | Add dependencies and the test script (design section 8) |
| pnpm-lock.yaml | 1 | Updated by pnpm |
| tsconfig.json | 1 | Add `jsx`, `dom` types for the shell and stories (design section 1) |
| .gitignore | 1 | Add `.data/`, `.next/`, `storybook-static/` |
| conformance.config.json | 12 | Set `checks.test` (P9). Protected: the user must run `touch .conformance/unlock` first |
| docs/generated/catalog.md, docs/generated/catalog.json | 9 | Regenerated with `pnpm conformance --write-catalog` |
| docs/provider-ports.md | 12 | Record the timestamp decision and planned adapters |
| docs/function-strips-plan.md | 12 | Record the decisions on `uses` and cache permissions, and remove the timestamp item from "still open" |
| docs/environments.md | 12 | Record the `local`, `dev` and `prod` choices made in the skeleton |
| docs/README.md | 12 | Update status |
| docs/kiroween-script.md | each checkpoint | Build log entries and scene status |

## New files

Created by the tasks, listed in each task's `Writes:` line in `tasks.md`:

- `src/lib/**`, `src/ports/**`, `src/adapters/**`, `src/config/**`
- `src/steps/**`, `src/strips/**` (five steps, two strips, and their tests)
- `src/components/**`, `src/test-utils/**`, `src/app/**`
- `.storybook/**`
- `.kiro/specs/skeleton-core/tasks.md`, `.kiro/specs/skeleton-core/progress.md`

## Affected strip tests

None. No existing strip is modified.

## Execution mode

Final list in `tasks.md`:

- **Sequential**: tasks that edit existing files (1, 9, 12), and tasks that depend on earlier code.
- **Parallel, in worktrees, at most 2 at once**: tasks 4 (database port) and 5 (cache and storage ports). They only create new files in separate folders, and start after tasks 1 to 3 are committed, because they need `Result`, the cache envelope, and the logger, clock and ID ports.

## Decisions

| ID | Topic | Decision | Status | Reason |
|---|---|---|---|---|
| CP1 | Execution | Tasks 4 and 5 (database, and cache with storage) run in parallel worktrees. All other tasks run sequentially | confirmed (user, 2026-11-23) | Port folders are disjoint new files, so parallel is safe. It also exercises the worktree command, which is good footage for the video. The cost is a heavier load on a low-spec PC, so the alternative is all sequential |
| CP2 | Catalog | The catalog is regenerated once, in task 9, after all steps and strips exist | confirmed (user, 2026-11-23) | Steps and strips only appear in task 9, so earlier regeneration would be empty. Steps and strips appear in task 9 |
| CP3 | Protected edit | `conformance.config.json` is edited in task 12 after you unlock, together with the `stop.ts` message fix | confirmed (user, 2026-11-23) | One unlock covers both. If you prefer, unlock earlier so that `pnpm check` runs the tests from task 2 on, which gives earlier feedback. The cost is more unlocks |
