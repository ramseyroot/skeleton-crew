---
created: 2026-11-23
updated: 2026-11-23
---

# Design: Feature Layout

Implements `requirements.md` (F1 to F9 confirmed). Terms are defined there. Everything below marked **(proposed)** is a new default for review (G1 to G7, last section).

## 1. The layout

```
src/
  features/
    profile/                       one folder per feature
      index.ts                     public surface: the FeatureModule (collections, seed) and the page and strips it exports
      domain.ts                    schemas and types the feature owns
      steps/<class>/<domain>.<verb>.ts (+ .test.ts)
      strips/<domain>.<verb>.strip.ts (+ .strip.test.ts)
      ui/ProfileForm/ (+ stories)
      actions.ts                   Server Actions ("use server")
      page.tsx                     the page, exported for a route stub
      testing.ts                   test helpers for this feature
  shared/
    steps/<class>/                 steps used by more than one feature (none yet)
    ui/Toast/, ui/view-state.ts    UI used by more than one feature
  lib/  ports/  adapters/  config/ unchanged
  app/
    layout.tsx
    page.tsx                       route stub: export { default } from "../features/profile/page.tsx"
    features.ts                    the list of features (one line each)
    runtime.ts                     composes ports, migrates every listed feature's collections, seeds
```

A feature's step files must sit in `steps/<class>/` and its strip files in `strips/`. R05 keeps its meaning with the root changed from `src/steps` to `<feature>/steps`.

## 2. The feature module

`src/lib/feature.ts` (new) defines what a feature tells the app:

```ts
export type FeatureModule = {
  name: string;
  collections: CollectionDef[];                       // migrated at startup
  seed?: (ports: Ports) => Promise<Result<void>>;     // demo data, called only outside prod
};
```

`src/app/features.ts` lists them, one import and one array entry each. `runtime.ts` loops over that list instead of importing profile things directly. **Adding a feature** is: the folder, a route stub if it has a page, and one line in `features.ts`. **Removing** it is the reverse, and `pnpm feature remove` does it.

## 3. Checker changes

The checker discovers steps and strips by finding `defineStep` and `defineStrip` calls anywhere under `src`, so discovery needs no change. The rules that name a folder do.

- **`scripts/conformance/layout.ts`** (new, not protected) is the one place that knows the layout: `isStepFile(file)`, `isStripFile(file)`, `featureOf(file)` (a feature name, `"shared"`, or null), `stepClassOf(file)`, and `stepsRoot(feature)`. The rules call it. Config gains `folders.features` and `folders.shared`, and loses `folders.steps` and `folders.strips`.
- **Rules edited** (protected, so they need an unlock): R02, R04, R05, R09, R38 use `layout.ts`. R05 reports `file is not in <feature>/steps/<class>/`. R38 builds the expected shared step path as `src/shared/steps/<class>/<rest>.ts` and finds strip tasks by `src/features/*/strips/<strip>.strip.ts`. R33 is unchanged (the strip test sits next to the strip).
- **Config** (protected): `folders.features = "src/features"`, `folders.shared = "src/shared"`, `guardedFolders = ["src/features", "src/shared", "src/ports", "src/adapters", "src/lib"]`.
- **Catalog** (`catalog.ts`, not protected): each step and strip gets a `feature` field and the Markdown line a short feature tag. The 120-character line limit still holds.
- **Fixtures.** The checker's tests and 226 fixture files use `src/steps/...` and `src/strips/...`. They are moved mechanically to `src/features/demo/steps/...` and `src/features/demo/strips/...` with a script (relative imports between a feature's steps and strips keep working, since both move one level deeper together). Imports of ports or lib from a fixture get two more `../`. The script prints every file it changed, and the rule tests must pass afterwards.

## 4. New rules

All three are protected files, so they need an unlock. IDs continue from R41.

| Rule | Name | Severity | Catches |
|---|---|---|---|
| R42 | feature-isolation | error | An import from `features/<a>/` to `features/<b>/`, naming both. Imports from `shared`, `lib`, `ports` and the feature itself are fine. Code outside `features/` (the app) may import a feature only through its `index.ts`, or a page file from a route stub |
| R43 | step-used | warning | A step in no strip, naming it and its feature |
| R44 | registry-matches-folders | error | An adapter folder not imported by `config/registry.ts`, a registry import of an adapter folder that does not exist, a feature folder missing from `app/features.ts`, or an entry in it with no folder |

R44 reads imports with the TypeScript AST, like R03.

## 5. The `feature` command

`scripts/conformance/feature.ts` (new, not protected), run as `pnpm feature <list|show|remove> [name] [--yes]`.

- **list**: for each folder in `src/features/`, its strips, steps and route stubs.
- **show `<name>`**: files, strips and steps with permissions, shared steps it uses, and every file outside the folder that mentions it, split into route stubs, the `features.ts` entry, and other references.
- **remove `<name>`**: without `--yes` prints the plan and deletes nothing. With `--yes`, if any "other references" exist it stops and lists them. Otherwise it deletes the folder, its route stubs and its line in `features.ts`, then prints which shared steps no feature uses any more. It refuses when the feature's folder has uncommitted changes (requirement 4.6), so git can undo it.
- A **route stub** is a file under `src/app/` whose only statement is `export { default } from "<path into this feature>"`.

## 6. Moving the example

| From | To |
|---|---|
| `src/steps/{pure,db,cache}/*` | `src/features/profile/steps/{pure,db,cache}/*` |
| `src/strips/profile.*.strip*.ts` | `src/features/profile/strips/` |
| `src/domain/profile.ts` | `src/features/profile/domain.ts` |
| `src/components/ProfileForm/` | `src/features/profile/ui/ProfileForm/` |
| `src/app/actions.ts`, `ProfileEditor.tsx`, the page body | `src/features/profile/actions.ts`, `ui/ProfileEditor.tsx`, `page.tsx` |
| `src/components/Toast/`, `view-state.ts` | `src/shared/ui/` |
| `src/test-utils/ports.ts` profile seeding | `src/features/profile/testing.ts` (the generic part stays in `src/test-utils/ports.ts` and takes collections and a seed function) |

The page moves with `await connection()` from `next/server` instead of `export const dynamic = "force-dynamic"`, because Next.js does not accept a re-exported segment config in a route stub. `git mv` keeps history. The step names, strip names, permissions and tests do not change, so R17 (no widening) and the change plan's `reuse` entries hold.

## 7. Steering and docs

Steering files are re-pointed: `steps-<class>.md` match `src/features/**/steps/<class>/**` and `src/shared/steps/<class>/**`, `strips.md` matches `src/features/**/strips/**`, `core-rules.md` names the new guarded folders, and a short new `features.md` (loaded for `src/features/**` and `src/shared/**`) states the layout and the add and remove procedure. All stay under their line limits (R31). `docs/conformance-rules.md`, the README files, the ports document (adding and removing a provider: one folder, one registry line, one profile setting) and the illustrated page are updated.

## 8. Order of work, and why it is split

The layout, the config, the rules, the fixtures and the example must change together, or `pnpm check` fails in between. So the work is four sequential tasks, each leaving the check green:

1. **Preparation** (green on the old layout): `FeatureModule`, `features.ts`, `runtime.ts` loops over features, `test-utils/ports.ts` made generic, shared UI moved to `src/shared/ui/`.
2. **The layout switch** (needs an unlock): `layout.ts`, config, rules R02, R04, R05, R09, R38, catalog, fixtures and tests, steering, the example moved. One commit.
3. **New rules** R42 to R44 with fixtures and docs (needs an unlock).
4. **The `feature` command**, the removal test on a copy, docs, the page, final gates.

## 9. New defaults awaiting your decision

| # | Proposal | Alternative | State |
|---|---|---|---|
| G1 | A feature tells the app about itself through a `FeatureModule` (collections and optional seed), listed in `src/app/features.ts` | Auto-discover features by scanning folders | proposed |
| G2 | Shared UI (Toast, view-state) lives in `src/shared/ui/` | Keep `src/components/` | proposed |
| G3 | Pages opt into dynamic rendering with `await connection()` so the route stub can be a plain re-export | Keep a `dynamic` export in each route stub | proposed |
| G4 | Fixtures are moved mechanically to a `demo` feature under `src/features/demo/` | Rewrite the fixtures by hand | proposed |
| G5 | R42 allows the app (outside `features/`) to import a feature only through `index.ts` or a route stub's page file | No restriction outside features | proposed |
| G6 | `feature remove` refuses when the feature's folder has uncommitted changes | Allow it with `--force` | proposed |
| G7 | Four sequential tasks, two of them under an unlock (the layout switch and the new rules) | One unlock for everything | proposed |
