---
created: 2026-11-23
updated: 2026-11-23
---

# Implementation Plan: Skeleton Core

Tasks follow the change plan (CP1 to CP3). Tasks 4 and 5 run in parallel worktrees (`pnpm worktree create <id>`, then `verify`, `merge` in task order, `remove`). All others are `sequential` and run one at a time in the main tree.

`docs/change-process.md` section 5 describes one sequential phase followed by one parallel phase. Here the parallel tasks need code from tasks 1 to 3, and later tasks need theirs, so the phases alternate: tasks 1 to 3 (sequential), tasks 4 and 5 (parallel batch, merged and removed), tasks 6 to 12 (sequential). The main tree is not edited while a worktree is open.

Every task: append a `started` row to `progress.md` before writing files. On finish, tick the checkbox, append a `done` row, and commit the task's files with both, as `task(skeleton-core/<id>): <title>`. `progress.md` and `tasks.md` are implicitly in every task's `Writes:`. Every task passes `pnpm check` and `pnpm test` before its commit. (`pnpm test` runs the tests by hand until task 12 sets `checks.test`, see CP3.)

Checkpoints stop for your review after tasks 1, 7, 9, 11 and 13, and update `docs/kiroween-script.md` each time. After task 1 and task 11, the review includes a decision if a check fails (P10 cut order).

All test files use `node:test`, are named `<name>.test.ts`, and run offline.

- [x] 1. Setup and verification spike
  - Mode: sequential
  - Writes: package.json, pnpm-lock.yaml, pnpm-workspace.yaml, tsconfig.json, .gitignore, .kiro/specs/skeleton-core/design.md
  - Add dependencies from design section 8 (`zod`, `next`, `react`, `react-dom`, `@types/react`, `@types/react-dom`, `storybook`, `@storybook/nextjs-vite`, `vite`).
  - Add scripts: `test` (`node --test "src/**/*.test.ts"`), `dev`, `build`, `storybook`, `build-storybook`.
  - `tsconfig.json`: add `jsx` and the `dom` lib for the shell and stories. `pnpm check` must still pass.
  - Add `.data/`, `.next/`, `storybook-static/` to `.gitignore`.
  - Spike in a folder outside the repository (`/tmp`): Storybook starts and shows one story (record start time and memory), `next build` succeeds with `node:sqlite` imported from a server module, zod 4 `safeParse` works as R23 expects, and the checker accepts a `uses` field in a manifest. Record each result in design section 9.
  - If a check fails, mark the task `blocked` with the options (P10 cut order) and ask.
  - _Requirements: 9.6, 11.3_

- [x] 2. Result and cache envelope
  - Mode: sequential
  - Writes: src/lib/result.ts, src/lib/result.test.ts, src/lib/cache-envelope.ts, src/lib/cache-envelope.test.ts
  - `Result`, `StepError` (discriminated on `audience`), `ErrorKind`, `ok`, `err`, `typedError`, `fromThrown`.
  - Cache envelope: `wrap`, `unwrap`, `cacheKey`.
  - Tests: JSON round trip drops `cause`, `fromThrown` never fills `userMessage`, typed error keeps its kind, envelope valid, corrupt, outdated version, expired, and schema-failing entries.
  - _Requirements: 1.1 to 1.5, 6.1 to 6.5_

- [x] 3. Logger, Clock and IdGenerator ports with adapters
  - Mode: sequential
  - Writes: src/lib/error-map.ts, src/lib/error-map.test.ts, src/lib/port-error.ts, src/lib/port-error.test.ts, src/ports/logger.ts, src/ports/clock.ts, src/ports/ids.ts, src/adapters/logger/**, src/adapters/clock/**, src/adapters/ids/**
  - Ports with `redact()` in the logger port file. Adapters: `logger/console` and `logger/memory`, `clock/system` and `clock/fixed`, `ids/uuid` and `ids/sequence`.
  - Each port folder: `contract.test.ts`, and per adapter `index.ts`, `errors.ts`, `<adapter>.test.ts`.
  - Only `logger/console` calls `console`.
  - _Requirements: 4.1 to 4.5, 7.2, 7.3, 7.10_

- [x] 4. Database port with memory and sqlite adapters
  - Writes: src/ports/database.ts, src/adapters/database/**
  - Port and semantics as in design section 5: `read`, `write`, `batch`, `health`, `migrate`, ISO 8601 timestamps, text IDs, cursor pagination, normalization, `conflict` and `not_found`.
  - Adapters `memory` and `sqlite` (`node:sqlite`), each with `index.ts`, `errors.ts` (including a mapping table test that triggers a real constraint failure), and `<adapter>.test.ts`. One `contract.test.ts` for both.
  - Contract cases: missing read returns `null`, update of a missing record gives `not_found`, duplicate gives `conflict`, pagination, atomic batch rolls back on failure, `migrate()` twice, normalization.
  - _Requirements: 7.1 to 7.5, 7.8, 7.9, 7.11_

- [x] 5. Cache and ObjectStorage ports with adapters
  - Writes: src/ports/cache.ts, src/ports/storage.ts, src/adapters/cache/**, src/adapters/storage/**
  - Cache adapters `memory` and `null`, ObjectStorage adapters `memory` and `fs`, each with `index.ts`, `errors.ts`, `<adapter>.test.ts`, and one `contract.test.ts` per port.
  - Cache contract cases: miss on absent, corrupt, outdated, and expired entries, with the entry deleted and a debug log; `null` always misses; the capability mechanism tested with a fake adapter that declares `prefixDelete` false.
  - Storage contract cases: `get` missing gives `null`, `delete` missing succeeds, `list` with cursor, `fs` rejects keys that escape its root.
  - _Requirements: 7.1 to 7.3, 7.6 to 7.9, 7.11, 6.2_

- [x] 6. Step library
  - Mode: sequential
  - Writes: src/lib/step.ts, tests/lib/step.test.ts
  - `defineStep`, the wrapper, `ctx` built from `uses` and narrowed by permissions (design section 3, D2 and D3), entry and exit logging.
  - Tests: input and output schema failures give `validation`, a throw gives `unexpected`, a typed error keeps its kind, a `Result` passes through, a write outside the permissions gives `forbidden`, `writes: []` gives no write method (type test), logging entries match the shape.
  - _Requirements: 2.1 to 2.8_

- [x] 7. Strip library
  - Mode: sequential
  - Writes: src/lib/strip.ts, tests/lib/strip.test.ts
  - `defineStrip`, type chain check, load-time checks (D4), runner, routing actions (D5), invalidation with placeholders (D6), `StripResult` and `Display`.
  - Tests: type mismatch (type test), budget exceeded, missing routing, missing `invalidates`, each routing action, retry only when `retryable`, internal `toast` downgraded to generic with reference, `recover`, runner never throws.
  - _Requirements: 3.1 to 3.10_

- [x] 8. Config and profiles
  - Mode: sequential
  - Writes: src/config/profiles.ts, src/config/registry.ts, src/config/compose.ts, src/config/profiles.test.ts, src/config/compose.test.ts
  - `profiles` (`local`, `dev`, `prod`, D7) and `profileSchema`. `profiles.ts` imports only zod and runs under plain Node (R23).
  - Registry of adapter factories with the hosts each reaches. `compose()` with the startup guard.
  - Tests: unknown or missing `APP_ENV`, schema failure lists all problems, `local` with a non-local host, `dev` using a `prod` host, unregistered adapter, `dev` and `prod` require their env paths.
  - _Requirements: 5.1 to 5.7_

- [x] 9. Example steps, strips and catalog
  - Mode: sequential
  - Writes: src/domain/profile.ts, src/steps/pure/profile.parseForm.ts, src/steps/db/user.setDisplayName.ts, src/steps/cache/profile.read.ts, src/steps/db/user.findProfile.ts, src/steps/cache/profile.write.ts, src/steps/pure/profile.parseForm.test.ts, src/steps/db/user.setDisplayName.test.ts, src/steps/db/user.findProfile.test.ts, src/steps/cache/profile.read.test.ts, src/steps/cache/profile.write.test.ts, src/strips/profile.save.strip.ts, src/strips/profile.view.strip.ts, src/strips/profile.save.strip.test.ts, src/strips/profile.view.strip.test.ts, src/test-utils/ports.ts, docs/generated/catalog.md, docs/generated/catalog.json
  - Five steps and two strips from design section 6, with trigger, end states and side-effect boundary written in each strip file.
  - Strip tests: both database adapters, cache memory and `null`, the five end states of requirement 8.5, and that `profile.save` removes `profile:<userId>` from the cache.
  - `pnpm conformance --write-catalog`, then commit the result.
  - _Requirements: 8.1 to 8.6, 11.2_

- [x] 10. Components, fixtures and stories
  - Mode: sequential
  - Writes: src/test-utils/fixtures.ts, src/components/view-state.ts, src/components/Toast/**, src/components/ProfileForm/**, .storybook/**
  - `okResult`, `errResult`, a `ViewState` type, `Toast` and `ProfileForm` client components with `Result`-shaped props, one story per end state, Toast stories for user error, internal error with reference, and a long message.
  - Verify Storybook starts without any network call or database, and record start time and memory in `progress.md`.
  - _Requirements: 9.1 to 9.6_

- [x] 11. Next.js shell
  - Mode: sequential
  - Writes: src/app/**, next.config.ts, src/components/view-state.ts, src/components/ProfileForm/ProfileForm.tsx, tests/lib/view-state.test.ts, package.json, tsconfig.json
  - Server page running `profile.view`, a Server Action running `profile.save` that returns a plain `StripResult`, seed of one demo user for `local`, toast for user errors and reference code for internal errors.
  - Verify `APP_ENV=local pnpm build` once, and that the page starts offline (`unshare -rn`).
  - If `node:sqlite` cannot be bundled, use the fallback in design section 7 and record it.
  - _Requirements: 10.1 to 10.6_

- [x] 12. Reporter and Metrics ports with adapters
  - Mode: sequential
  - Writes: src/ports/logger.ts, src/adapters/logger/contract.test.ts, src/ports/reporter.ts, src/ports/metrics.ts, src/adapters/reporter/**, src/adapters/metrics/**
  - Needs the change plan committed `active` (edits two existing guarded files).
  - `LogEntry.data` (kept by redaction), `shouldReport`, `cleanTags`, and the three adapters of each port with `errors.ts`, a contract suite each, and adapter tests. The `log` adapters write through the Logger port.
  - _Requirements: 12.1, 12.2, 12.5, 12.6, 13.1, 13.2, 13.4, 13.5, 13.6_

- [x] 13. Wire reporting, metrics and the `dev` flag
  - Mode: sequential
  - Writes: src/lib/step.ts, src/lib/strip.ts, src/config/profiles.ts, src/config/registry.ts, src/config/compose.ts, src/config/profiles.test.ts, src/config/compose.test.ts, src/test-utils/ports.ts, tests/lib/step.test.ts, tests/lib/strip.test.ts, src/app/page.tsx
  - `Ports` gets `reporter` and `metrics`. The step wrapper emits `step.duration_ms`. The runner reports final internal errors of the reported kinds and emits `strip.runs` and `strip.duration_ms`. Telemetry failures never change a result.
  - Profiles: new adapter keys, gating rules, shipped `prod` uses `log`. `compose()` returns `dev`. The demo page footer shows it.
  - Both strip test files must pass (they are the affected tests).
  - _Requirements: 3.9, 12.3, 12.4, 13.3, 13.5, 14.1 to 14.5_

- [x] 14. Final docs, tooling, gates and the illustrated page
  - Mode: sequential
  - Writes: docs/today/**, conformance.config.json, scripts/conformance/hooks/stop.ts, docs/provider-ports.md, docs/function-strips-plan.md, docs/environments.md, docs/README.md, docs/kiroween-script.md, docs/kiroween-submission.md, docs/generated/catalog.md, docs/generated/catalog.json
  - Needs the user's `touch .conformance/unlock` first. Set `checks.test` (P9) and fix the duplicate "Full report" line in `stop.ts`.
  - Record the timestamp decision, planned adapters (PocketBase, Supabase, Workers KV, R2), `uses`, cache permissions, and the profiles in their docs. Update README status.
  - Run `pnpm check`, `pnpm test` with the network blocked (`unshare -rn`), and `pnpm conformance --write-catalog` with no diff.
  - Update `kiroween-script.md` (scenes 3 to 6 status, build log) and `kiroween-submission.md`.
  - Build `docs/today/index.html`: one self-contained illustrated page (inline CSS and SVG, screenshots copied into `docs/today/media/`, no network needed) that explains what was built, with diagrams, the test and commit numbers, the screenshots, and what is still open. It states only what exists.
  - _Requirements: 11.1, 11.2, 11.4, 11.5_
