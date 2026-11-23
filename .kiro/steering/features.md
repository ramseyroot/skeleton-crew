---
inclusion: fileMatch
fileMatchPattern: ["src/features/**", "src/shared/**", "src/app/**"]
---

# Features

Checked by `pnpm check`: R02 to R16 for steps and strips wherever they live, R42 (features do not import each other), R43 (step used by no strip), R44 (registries match folders, no half-enabled feature), R45 (each feature has a valid feature.json).

## Layout

```
src/features/<name>/        one folder per feature
  feature.json              manifest: name, module, route stubs
  index.ts                  public surface
  domain.ts                 schemas and types the feature owns
  steps/<class>/            <domain>.<verb>.ts and its .test.ts
  strips/                   <domain>.<verb>.strip.ts and its .strip.test.ts
  ui/  actions.ts  page.tsx  its components with stories, Server Actions, page
src/shared/steps/<class>/   steps used by more than one feature
src/shared/ui/              UI used by more than one feature
src/app/                    layout, one-line route stubs, features.ts, runtime.ts
```

## Rules of thumb

- A feature imports only from itself, `src/lib`, `src/ports` and `src/shared`. Never from another feature.
- A step needed by two features goes to `src/shared/steps/<class>/`, created once, before the strips that use it.
- Each feature has a `feature.json` (name, module, route stubs).
- Adding a feature: its folder with `feature.json`, then `pnpm feature enable <name> --yes` (writes the stubs and the line in `src/app/features.ts`).
- Switching off: `pnpm feature disable <name> --yes`. The folder stays and stays tested. Deleting for good: `pnpm feature prune <name> --yes`, only for a disabled feature. `pnpm feature show <name>` first.
- Providers stay in `src/adapters/<port>/<provider>/`. Adding one: the folder, one line in `src/config/registry.ts`, one profile setting.
