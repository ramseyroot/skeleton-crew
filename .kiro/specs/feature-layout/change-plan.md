---
status: done
created: 2026-11-23
updated: 2026-11-23
---

# Change Plan: Feature Layout

The catalog was read. The five example steps and two strips are **moved**, not changed: their names, inputs, outputs, permissions and tests stay the same, so they are `reuse`. No step or strip is created or modified in contract.

## Strips in this spec

- profile.save
- profile.view

## Steps

| Step | Action | Used by (this spec) | Affected strips | Reason | Distinct from |
|---|---|---|---|---|---|
| pure.profile.parseForm | reuse | profile.save | | Moved to `src/features/profile/steps/pure/`, contract unchanged | |
| db.user.setDisplayName | reuse | profile.save | | Moved, contract unchanged | |
| cache.profile.read | reuse | profile.view | | Moved, contract unchanged | |
| db.user.findProfile | reuse | profile.view | | Moved, contract unchanged | |
| cache.profile.write | reuse | profile.view | | Moved, contract unchanged | |

No new step is created, so there is no shared new step and no near-duplicate to explain.

## Existing files to edit

Existing files in the guarded folders (`src/steps`, `src/strips`, `src/ports`, `src/adapters`, `src/lib`) that tasks move or delete. A move shows as a delete of the old path, so each is listed:

| File | Task | Reason |
|---|---|---|
| src/steps/pure/profile.parseForm.ts, src/steps/pure/profile.parseForm.test.ts | 2 | Moved to the profile feature |
| src/steps/db/user.setDisplayName.ts, src/steps/db/user.setDisplayName.test.ts | 2 | Moved |
| src/steps/db/user.findProfile.ts, src/steps/db/user.findProfile.test.ts | 2 | Moved |
| src/steps/cache/profile.read.ts, src/steps/cache/profile.read.test.ts | 2 | Moved |
| src/steps/cache/profile.write.ts, src/steps/cache/profile.write.test.ts | 2 | Moved |
| src/strips/profile.save.strip.ts, src/strips/profile.save.strip.test.ts | 2 | Moved |
| src/strips/profile.view.strip.ts, src/strips/profile.view.strip.test.ts | 2 | Moved |

Existing files outside the guarded folders:

| File | Task | Reason |
|---|---|---|
| src/domain/profile.ts | 2 | Moved to `src/features/profile/domain.ts` |
| src/components/Toast/**, src/components/view-state.ts | 1 | Moved to `src/shared/ui/` |
| src/components/ProfileForm/** | 2 | Moved into the feature |
| src/app/actions.ts, src/app/actions.test.ts, src/app/ProfileEditor.tsx, src/app/page.tsx, src/app/runtime.ts, src/app/runtime.test.ts | 1, 2 | Runtime loops over features. Actions, editor and page move into the feature. The page becomes a route stub |
| src/test-utils/ports.ts | 1 | Generic: takes collections and a seed |
| tests/lib/view-state.test.ts | 1 | Import path of the moved file |
| tests/lib/step.test.ts, tests/lib/strip.test.ts | none | Not edited |
| .storybook/main.ts | none | Its glob already covers `src/**` |
| conformance.config.json | 2 | Folders and guarded folders (protected, unlock) |
| scripts/conformance/rules/R02, R04, R05, R09, R38, index.ts | 2, 3 | Layout and new rules (protected, unlock) |
| scripts/conformance/{config,catalog,cli}.ts, test/** | 2 | Folder keys, feature field, fixtures |
| .kiro/steering/*.md | 2 | New path patterns (protected, unlock) |
| docs/conformance-rules.md, docs/README.md, docs/provider-ports.md, docs/function-strips-plan.md, docs/environments.md, docs/today/build.mjs, README.md, docs/generated/catalog.* | 2 to 4 | Layout, rules, procedures, regenerated catalog |
| src/features/profile/actions.test.ts | 4 | Builds its runtime from the feature's own list, so it still runs while the feature is disabled in the app (found by the disable trial) |
| src/app/runtime.ts, src/app/runtime.test.ts | 4 | Takes a feature list, so its tests use no real feature |
| package.json | 4 | `feature` script |
| src/app/features.ts | 4 | One line per import and per entry, so a tool can edit it |
| scripts/conformance/rules/index.ts | 4 | R45 (protected, unlock) |

## New files

- `src/lib/feature.ts` (task 1), `src/app/features.ts` (task 1)
- `src/shared/ui/**` (task 1), `src/features/profile/**` (task 2)
- `scripts/conformance/layout.ts` (task 2), `scripts/conformance/feature.ts` and its tests (task 4)
- `scripts/conformance/rules/R42-*.ts`, `R43-*.ts`, `R44-*.ts` and their fixtures (task 3), `R45-feature-manifest.ts` and its fixtures (task 4)
- `src/features/profile/feature.json` (task 4)
- `.kiro/steering/features.md` (task 2)

## Affected strip tests

The strips and their tests moved in task 2. Both run as affected tests:

- src/features/profile/strips/profile.save.strip.test.ts
- src/features/profile/strips/profile.view.strip.test.ts

## Execution mode

All four tasks are `sequential`, one at a time in the main tree, by the main agent. They edit existing files, and the layout switch cannot be split without leaving `pnpm check` red. Tasks 2, 3 and 4 (for R45) need the user's `touch .conformance/unlock` first.

## Decisions

| ID | Topic | Decision | Status | Reason |
|---|---|---|---|---|
| CP1 | Execution | Four sequential tasks, no parallel worktrees | proposed | Every task edits existing files |
| CP2 | Unlocks | Two: task 2 (config, rules, steering) and task 3 (new rules) | proposed | Group protected edits |
| CP3 | Commit granularity | Task 2 is one large commit, because the layout, config, rules, fixtures and example cannot be committed separately and stay green | proposed | Keeps every commit passing |
