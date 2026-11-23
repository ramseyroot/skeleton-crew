# Skeleton Crew

A template for building apps like Lego, in code that is meant to last.

Built with Kiro for the Kiroween 2026 hackathon (Skeleton Crew category). It is the foundation for two applications, Zidolia and MiniCargo, which are developed in their own repositories and will appear in `apps/` here. **Neither app is in this repository yet.**

## The three promises

**1. Build like Lego.** Add or remove a feature or a provider cleanly, without hunting through nested code.
- A feature is a strip: one file that lists its steps, what it may touch, and what happens when a step fails.
- A provider (database, cache, storage, logging, error tracking, metrics) sits behind a port. Swapping one means one adapter folder and one setting. Steps and strips never change.
- A generated catalog lists every step and strip and who uses it, so you can see what removing something touches before you do it.

**2. Good code, not prototype code.** Every step declares its input, output and permissions. Errors are values (`Result`), never strings that look like data. Every port has a shared contract test suite that all its adapters must pass. Forty-one rules are checked by one command, and Kiro hooks stop an AI agent from finishing, or editing code its plan did not cover, until the checks pass.

**3. The parts prototypes skip.** Observability (every log line carries a strip reference, payloads are redacted in production, an error reporter and metrics with per-step timings), validated config that stops the app at startup on a bad setting, development data kept apart from production data, an offline local mode, and real tests.

## Honest status

| Promise | Built | Not built yet |
|---|---|---|
| Lego | Strips, ports with two or three adapters each, the catalog, permission budgets, profiles that pick adapters | A feature is still spread over several folders (see below). Adding an adapter means editing the adapter registry. Nothing flags a step that no strip uses |
| Good code | Result type, manifests, contract suites, the checker, hooks, 445 tests | |
| Parts prototypes skip | Logger with redaction, error reporter and metrics ports, step and strip timings, profile gating, startup guards, offline mode | Hosted error-tracking and metrics adapters, passing the strip reference on outgoing HTTP calls, health check endpoint, audit log, alerting. Auth, API keys, plans, rate limits and payments are not built |

**Where it is not yet Lego.** The example feature (a user's display name) lives in `src/steps/{pure,db,cache}/`, `src/strips/`, `src/domain/`, `src/components/` and `src/app/`. Removing it means touching all of them. The layout is organized by kind of code, not by feature. See `docs/README.md`, "Still open".

An illustrated summary of the build is `docs/today/index.html` (open it in a browser). Start with `docs/README.md`.

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
