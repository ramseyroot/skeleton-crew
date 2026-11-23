---
created: 2026-11-23
updated: 2026-11-23
---

# Implementation Plan: Feature Layout

All tasks are sequential, run by the main agent, one at a time. Each passes `pnpm check` and, when the checker changes, `pnpm test:conformance` before its commit. Every task: append a `started` row to `progress.md` first. On finish, tick the checkbox, append a `done` row, and commit as `task(feature-layout/<id>): <title>`. Tasks 2 and 3 need `touch .conformance/unlock` from the user first (it lasts 30 minutes, so each task starts its protected edits early).

Checkpoints stop for review after tasks 2 and 4.

- [x] 1. Preparation on the old layout
  - Mode: sequential
  - Writes: src/lib/feature.ts, src/app/features.ts, src/app/runtime.ts, src/app/runtime.test.ts, src/shared/ui/**, src/components/Toast/**, src/components/view-state.ts, src/components/ProfileForm/ProfileForm.tsx, src/components/ProfileForm/ProfileForm.stories.tsx, src/app/ProfileEditor.tsx, src/test-utils/ports.ts, src/test-utils/fixtures.ts, tests/lib/view-state.test.ts, src/steps/**, src/strips/**, src/domain/profile.ts
  - `FeatureModule` type, `app/features.ts`, `runtime.ts` migrates and seeds by looping over the listed features. `test-utils/ports.ts` takes collections and a seed function. Toast and view-state move to `src/shared/ui/`. The profile feature exposes a `FeatureModule` from its domain file for now. Step and strip files only get their import paths updated if a moved file requires it.
  - _Requirements: 1.1, 6.1 (partly)_

- [x] 2. The layout switch (unlock)
  - Mode: sequential
  - Writes: conformance.config.json, scripts/conformance/layout.ts, scripts/conformance/config.ts, scripts/conformance/catalog.ts, scripts/conformance/cli.ts, scripts/conformance/rules/R02-no-error-as-value.ts, scripts/conformance/rules/R04-no-raw-queries.ts, scripts/conformance/rules/R05-step-name-format.ts, scripts/conformance/rules/R09-step-must-be-defined.ts, scripts/conformance/rules/R38-plan-shared-new-once.ts, scripts/conformance/test/**, .kiro/steering/**, docs/conformance-rules.md, src/features/**, src/shared/**, src/steps/**, src/strips/**, src/domain/**, src/components/**, src/app/**, src/test-utils/**, docs/generated/catalog.md, docs/generated/catalog.json
  - Config and `layout.ts`. Rules R02, R04, R05, R09, R38 use it. Catalog gets the feature field. Fixtures moved by script to `src/features/demo/`, and every rule test passes. Steering re-pointed, `features.md` added. The example moved with `git mv`: steps, strips, domain, UI, actions, page (with `await connection()`), route stub, `testing.ts`. Catalog regenerated, `next build` and Storybook checked.
  - One commit. Do not commit while `pnpm check` or `pnpm test:conformance` fails.
  - _Requirements: 1.1 to 1.5, 3.1 to 3.6, 6.1 to 6.3, 7.1_

- [x] 3. New rules R42 to R44 (unlock)
  - Mode: sequential
  - Writes: scripts/conformance/rules/R42-feature-isolation.ts, scripts/conformance/rules/R43-step-used.ts, scripts/conformance/rules/R44-registry-matches-folders.ts, scripts/conformance/rules/index.ts, scripts/conformance/test/fixtures/R42/**, scripts/conformance/test/fixtures/R43/**, scripts/conformance/test/fixtures/R44/**, scripts/conformance/test/rules.test.ts, docs/conformance-rules.md
  - Each rule has a bad and a good fixture, an entry in the rules document in the standard format, and a registry entry. The repository itself must pass them.
  - _Requirements: 2.1 to 2.4, 5.2_

- [x] 4. The `feature` command, manifest, rule R45, removal test, docs and gates (unlock for R45)
  - Mode: sequential
  - Writes: scripts/conformance/feature.ts, scripts/conformance/test/feature.test.ts, scripts/conformance/rules/R45-feature-manifest.ts, scripts/conformance/rules/index.ts, scripts/conformance/test/fixtures/R45/**, src/features/profile/feature.json, src/app/features.ts, package.json, README.md, docs/README.md, docs/provider-ports.md, docs/function-strips-plan.md, docs/environments.md, docs/conformance-rules.md, docs/kiroween-script.md, docs/today/build.mjs, docs/today/index.html, docs/generated/catalog.md, docs/generated/catalog.json
  - `list`, `show`, `disable`, `enable`, `prune` with tests on a temporary git project, covering each refusal. The feature list becomes line-oriented. `feature.json` for the profile feature. Rule R45 with fixtures and its section in the rules document. Try `disable profile`, `prune profile` and `enable profile` once on a copy of the repository, run `pnpm check` after each, and record the results in `progress.md`. Document adding and removing a feature and a provider. Regenerate the page. Run `pnpm check`, the checker tests, and the skeleton tests with the network blocked.
  - _Requirements: 4.1 to 4.8, 5.3, 6.4, 7.2, 7.3, 9.1 to 9.3_
