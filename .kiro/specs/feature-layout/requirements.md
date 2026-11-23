---
created: 2026-11-23
updated: 2026-11-23
---

# Requirements Document: Feature Layout

## Introduction

The template should let an app author add or remove a feature by adding or deleting one folder, without hunting through code organized by kind. Today the example feature (a user's display name) is spread over `src/steps/{pure,db,cache}/`, `src/strips/`, `src/domain/`, `src/components/` and `src/app/`. The checker, the hooks and the steering files all assume that layout.

This spec moves the template to **feature folders** (`src/features/<name>/`), keeps providers where they are (`src/ports/`, `src/adapters/`), and changes the checker, the hooks, the steering and the example to match. It also adds a command that shows what a feature owns and removes it, and two checks that keep features independent.

This spec does not add auth, API keys, plans, metering, rate limits or payments. Those are a separate spec (`platform-parts`), planned after this one, and they will be built as features and ports in the new layout. The builder confirmed on 2026-11-23 that both apps share all of those parts.

### Terms

- **Feature**: a folder under `src/features/` that owns everything for one capability: its steps, its strips, its domain types, its UI and its tests.
- **Shared step**: a step used by more than one feature. It lives in `src/shared/`.
- **Public surface**: the one file (`index.ts`) through which code outside a feature may use it.
- **Route stub**: a one-line file in `src/app/` that re-exports a page from a feature, because Next.js needs route files under `src/app/`.

### Proposed defaults

Values marked **(proposed)** are shown for review. They become decisions only when marked `confirmed` or `changed` in the last section.

---

## Requirements

### Requirement 1: One folder per feature

**User Story:** As an app author, I want everything a feature owns in one folder, so that adding or removing it does not mean searching other folders.

#### Acceptance Criteria

1. A feature SHALL live in `src/features/<name>/` **(proposed)** and own: `steps/<class>/`, `strips/`, its domain schemas, its UI components with their stories, its Server Actions, its tests, and an `index.ts` public surface.
2. THE tests of a step, a strip or a component SHALL sit next to the file they test, inside the feature.
3. A feature name SHALL be lowercase letters, digits and hyphens.
4. A step's file SHALL be in `steps/<class>/` of its feature, where `<class>` is the class the step declares. A strip's file SHALL be named `<name>.strip.ts` in `strips/` of its feature.
5. THE step name format `<class>.<domain>.<verb>` and the strip name format `<domain>.<verb>` SHALL stay as they are.

### Requirement 2: Features are independent

**User Story:** As an app author, I want features that cannot reach into each other, so that removing one cannot break another.

#### Acceptance Criteria

1. WHEN a file in one feature imports a file in another feature, THEN the checker SHALL report an error naming both features. **(proposed severity: error)**
2. A feature MAY import from `src/lib/`, `src/ports/`, `src/shared/`, and from its own folder. Code outside the features folder MAY import a feature only through its `index.ts`, except for route stubs, which import the page file.
3. WHEN a step is needed by more than one feature, THEN it SHALL be created once in `src/shared/steps/<class>/` and used by the features from there. **(proposed)** The change-plan rules for a new shared step (R38) SHALL apply to it.
4. A step that is defined but listed in no strip SHALL be reported as a warning, naming the step and its feature. **(proposed)**

### Requirement 3: The checker understands features

**User Story:** As a maintainer, I want every existing rule to keep working on the new layout, so that nothing is checked less than before.

#### Acceptance Criteria

1. THE checker SHALL find steps and strips in `src/features/*/` and in `src/shared/`, and SHALL treat both the same way for every rule that applies to steps and strips (R02, R04 to R16, R17, R32, R33, R38, R39).
2. THE rules that name a folder (R02, R04, R05, R09, R38) SHALL use the configured roots, not hard-coded `src/steps` and `src/strips` paths.
3. THE catalog SHALL list each step and strip with its feature (or `shared`), and SHALL stay within the existing line length limit.
4. THE `guardedFolders` setting SHALL cover `src/features`, `src/shared`, `src/ports`, `src/adapters` and `src/lib`, so that R37 and the protection hook treat an edit to an existing feature file the way they treat an edit to an existing step today.
5. THE old locations `src/steps/` and `src/strips/` SHALL no longer be used. **(proposed: the new layout only, no support for both)**
6. THE checker's own tests and fixtures SHALL be updated to the new layout, and all of them SHALL pass.

### Requirement 4: Commands to see, disable, enable and prune a feature

**User Story:** As an app author, I want to switch a feature off and back on, and to delete it for good only when I mean to, so that removing something is never a one-way door.

#### Acceptance Criteria

1. `pnpm feature list` SHALL print each feature with its state (`enabled` or `disabled`), its strips, its steps and its route stubs.
2. `pnpm feature show <name>` SHALL print the feature's files, its strips and steps with their permissions, every file outside the feature that refers to it, and the shared steps it uses.
3. `pnpm feature disable <name>` SHALL delete the feature's route stubs and its entry in the app's feature list, and SHALL keep the feature folder. WHEN code outside the feature (other than its stubs and the feature list) refers to it, THEN the command SHALL change nothing and SHALL list those references.
4. `pnpm feature enable <name>` SHALL recreate the route stubs and the feature-list entry from the feature's manifest. WHEN a stub's path is taken by a different file, THEN the command SHALL change nothing and SHALL name the file.
5. `pnpm feature prune <name>` SHALL delete the folder of a **disabled** feature, and SHALL refuse an enabled one. It SHALL say which shared steps no feature uses any more.
6. EVERY command that changes files SHALL print what it would do and change nothing unless `--yes` is given.
7. `disable`, `enable` and `prune` SHALL refuse when the feature's folder or the files they would change have uncommitted changes, so git can always undo them.
8. A disabled feature SHALL stay in the type check, the tests and every rule, so it cannot rot while switched off.

### Requirement 9: The feature manifest

**User Story:** As an app author, I want each feature to say how it is wired in, so that switching it on again does not depend on anyone remembering.

#### Acceptance Criteria

1. EACH feature SHALL have a `feature.json` in its folder with: `name`, `module` (the exported name of its `FeatureModule` in `index.ts`), and `routes` (a list of `{ "stub": "<path>", "content": "<the stub's one line>" }`).
2. A rule SHALL report a feature folder without a valid `feature.json`, and a manifest whose `name` differs from its folder. **(proposed severity: error)**
3. `enable` and `disable` SHALL read only the manifest and the feature list, so they work for any feature that follows the format.

### Requirement 5: Providers stay clean to add and remove

**User Story:** As an app author, I want adding or removing a provider to be one folder and one line, so that I can swap a database or a mailer without surprises.

#### Acceptance Criteria

1. Adapters SHALL stay in `src/adapters/<port>/<provider>/` with their tests, as today.
2. A rule SHALL report an adapter folder that the registry does not list, and a registry entry whose folder does not exist. **(proposed severity: error)**
3. THE docs SHALL state the steps to add and to remove a provider, and each SHALL be at most: one adapter folder, one registry line, one profile setting.

### Requirement 6: The example feature moves

**User Story:** As a reviewer, I want the example moved with no change in behavior, so that the move proves the new layout works.

#### Acceptance Criteria

1. THE example feature SHALL be moved to `src/features/profile/` with its steps, strips, domain, components, stories, Server Action and tests.
2. THE app's route SHALL be a route stub in `src/app/`, and `src/app/` SHALL hold only the layout, the route stubs and the runtime.
3. AFTER the move, the same tests SHALL pass, the Storybook stories SHALL render, `next build` SHALL pass, and the catalog SHALL differ only in file paths and the feature column.
4. WHEN the example feature is deleted with `pnpm feature remove profile --yes`, THEN `pnpm check` SHALL still pass once its route stub and the home page link are gone. This SHALL be tried once on a copy and recorded in `progress.md`.

### Requirement 7: Hooks, steering and docs follow

**User Story:** As an agent working in the repository, I want the rules I am shown to match the layout, so that the guidance is not wrong.

#### Acceptance Criteria

1. THE steering files SHALL load by the new paths (`src/features/**/steps/<class>/**`, `src/features/**/strips/**`, `src/shared/**`) and SHALL stay within their size limits.
2. THE conformance rules document (`docs/conformance-rules.md`) SHALL describe the new and changed rules in the existing format.
3. THE README, the plan, the environments and ports documents, and the illustrated page SHALL describe the feature layout and the add and remove procedures.

### Requirement 8: Process

1. THIS spec SHALL follow `docs/change-process.md`. Edits to the checker rules, `conformance.config.json` and the steering files need the user's unlock and SHALL be grouped into as few unlocks as the work allows.
2. THE tasks that edit existing files SHALL be sequential. Each task SHALL pass `pnpm check` and the checker's own tests before its commit.

---

## Proposed defaults, awaiting your decision

| # | Proposal | Alternative | State |
|---|---|---|---|
| F1 | A feature folder holds `steps/<class>/`, `strips/`, domain, UI with stories, actions, tests, and an `index.ts` public surface | Fewer folders per feature | confirmed (user, 2026-11-23) |
| F2 | Shared steps and shared domain types live in `src/shared/` | A `shared` feature | confirmed (user, 2026-11-23) |
| F3 | The new layout only. `src/steps/` and `src/strips/` go away | Support both layouts for a while | confirmed (user, 2026-11-23) |
| F4 | Importing another feature is an error | A warning | confirmed (user, 2026-11-23) |
| F5 | A step in no strip is a warning | An error | confirmed (user, 2026-11-23) |
| F6 | Route stubs are one-line re-exports in `src/app/` | Features own `src/app` routes directly | confirmed (user, 2026-11-23) |
| F7 | `pnpm feature list`, `show` and `remove`, with `remove` printing a plan unless `--yes` is given | Only `list` and `show` | confirmed (user, 2026-11-23) |
| F8 | A rule keeps the adapter registry and the adapter folders in step | Leave the registry unchecked | confirmed (user, 2026-11-23) |
| F10 | Features can be disabled and enabled, and only a disabled one can be pruned. Each has a `feature.json` manifest | Delete-only removal | confirmed (user, 2026-11-23) |
| F9 | The platform parts (auth, API keys, authorization, plans, metering, rate limits, payments) are a separate spec after this one, since both apps share all of them | Build them first | confirmed (user, 2026-11-23) |
