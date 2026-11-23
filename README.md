# Skeleton Crew

An app template that keeps AI agents honest. The project checks its own rules, and the agent cannot finish its work, or edit code its plan did not cover, until the checks pass.

Built with Kiro for the Kiroween 2026 hackathon (Skeleton Crew category). The template is the foundation for two applications, Zidolia and MiniCargo, which are developed in their own repositories and will appear in `apps/` here. **Neither app is in this repository yet.**

## What is in the template

- **Guardrails.** A checker with 41 rules (`pnpm conformance`), one command that runs everything (`pnpm check`), Kiro hooks that send the agent back while checks fail and block edits to protected files, and a worktree command for parallel agents.
- **Skeleton core.** A `Result` type, steps and strips (a feature is a chain of small steps with declared permissions), and eight ports, each with two or three adapters and a shared contract test suite: database, cache, object storage, logger, clock, ids, error reporter, metrics.
- **Profiles.** `local`, `dev` and `prod`, with startup guards that stop the app on a bad host, path or shared data. `local` runs fully offline.
- **One example feature** (`profile.save`, `profile.view`), Storybook stories for its states, and a small Next.js page.

Start with `docs/README.md`. An illustrated summary of the build is `docs/today/index.html` (open it in a browser).

## Run it

Needs Node 24 or newer and pnpm 11.

```
pnpm install
pnpm check            # conformance rules, typecheck, all tests (about 25 s)
pnpm test             # tests only, all offline
pnpm dev              # the example page, APP_ENV=local, http://localhost:3000
pnpm storybook        # component stories, http://localhost:6006
```

`pnpm dev` creates its local database and files under `.data/local/` (ignored by git) and adds two demo users. No network is needed.

## Where things are

| Folder | Contents |
|---|---|
| `src/lib/` | `Result`, `defineStep`, `defineStrip`, the cache envelope |
| `src/ports/`, `src/adapters/` | The eight ports and their adapters, with contract tests |
| `src/config/` | Profiles, the adapter registry, startup checks |
| `src/steps/`, `src/strips/` | The example feature |
| `src/app/`, `src/components/` | The Next.js page and the UI components with stories |
| `scripts/conformance/` | The checker, hooks and worktree command |
| `.kiro/` | Kiro specs, steering and hooks used to build this |
| `docs/` | Design documents, decisions, and the generated catalog |

## License

Copyright (C) 2026 Ramsey Selase Gborgla.

Licensed under the GNU Affero General Public License v3.0 only (AGPL-3.0-only). See `LICENSE`.
