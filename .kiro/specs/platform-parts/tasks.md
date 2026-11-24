---
created: 2026-11-23
updated: 2026-11-24
---

# Implementation Plan: Platform Parts

Tasks 2 and 3 run in parallel worktrees (`pnpm worktree create <id> --spec platform-parts`, then `verify`, `merge` in task order, `remove`). All others are sequential in the main tree. Every task: append a `started` row to `progress.md`, then on finish tick it, append a `done` row, and commit as `task(platform-parts/<id>): <title>`. Every task passes `pnpm check` before its commit. Checkpoints stop for review after tasks 5, 8 and 11.

If time runs short, cut in the order the builder confirmed (A13): the pages beyond the keys portal, the `database` rate limiter, the real Paystack adapter.

- [x] 1. Principal, authorization helpers, the API pipeline and the `sensitive` flag
  - Mode: sequential
  - Writes: src/lib/principal.ts, src/lib/authz.ts, src/lib/authz.test.ts, src/lib/http.ts, tests/lib/http.test.ts, src/lib/step.ts, src/lib/strip.ts, tests/lib/step.test.ts, tests/lib/strip.test.ts
  - `Principal`, the three authz helpers, `statusOf`, `errorBody`, rate limit headers, `createApiHandler` with fake dependencies in its tests. `sensitive` on `defineStep` and `defineStrip`: no input, output or message in logs or reports for them.
  - _Requirements: 4.1, 10.1 to 10.5, 12.3_

- [x] 2. RateLimiter port with memory and database adapters
  - Writes: src/ports/limiter.ts, src/adapters/limiter/**
  - Port, two adapters, contract suite with the concurrency test, `errors.ts`, the `rate_windows` collection definition in the adapter folder.
  - _Requirements: 6.1, 6.2, 6.6_

- [x] 3. Auth port with local and memory adapters
  - Writes: src/ports/auth.ts, src/adapters/auth/**
  - Port, `AUTH_COLLECTIONS`, the password policy helper, two adapters, contract suite (timing-similar failures, sessions, expiry), `errors.ts`.
  - _Requirements: 2.1 to 2.7_

- [x] 4. Payments port with fake, paystack and none adapters
  - Mode: sequential
  - Writes: src/ports/payments.ts, src/adapters/payments/**
  - Port, three adapters, contract suite, recorded Paystack request and response fixtures and a signed-webhook fixture, signature tests (good, bad, tampered, replay), `errors.ts`.
  - _Requirements: 8.1 to 8.7_

- [x] 5. Wire the ports: Ports, profiles, registry, compose, test helpers
  - Mode: sequential
  - Writes: src/lib/step.ts, tests/lib/step.test.ts, src/config/profiles.ts, src/config/registry.ts, src/config/compose.ts, src/config/profiles.test.ts, src/config/compose.test.ts, src/test-utils/ports.ts
  - `Ports` and `PortName` extended, the three new profile keys with gating, the Paystack key and host, test helpers with the new memory adapters.
  - _Requirements: 1.4, 8.8_

- [x] 6. Checkpoint review of the foundation
  - Mode: sequential
  - Writes: .kiro/specs/platform-parts/progress.md
  - Run `pnpm check`, the offline test run and the build. Report to the builder. No code.
  - _Requirements: 12.1, 12.2_

- [x] 7. Feature `accounts`
  - Mode: sequential
  - Writes: src/features/accounts/**, src/app/features.ts
  - Steps, strips and tests as in design 5.1, the `me.get` endpoint definition, log in and sign up pages with stories, Server Actions that set the session cookie, `feature.json`, seed of one demo account.
  - _Requirements: 1.1 to 1.3, 2.1 to 2.7, 4.3, 11.1, 11.2_

- [ ] 8. Feature `api-keys`
  - Mode: sequential
  - Writes: src/features/api-keys/**, src/app/features.ts
  - Steps, strips, `keygen.ts` helper, the keys page with stories, `feature.json`. A test feeds a known key through every strip and checks the logger, reporter and metrics hold no trace of it.
  - _Requirements: 3.1 to 3.5, 11.1 to 11.3_

- [ ] 9. Feature `billing`
  - Mode: sequential
  - Writes: src/features/billing/**, src/app/features.ts
  - Plans seed, steps, strips, billing page, fake checkout page, webhook handling with idempotency, `feature.json`.
  - _Requirements: 5.1 to 5.4, 8.4, 9.1 to 9.4, 11.1, 11.2_

- [ ] 10. Feature `usage`
  - Mode: sequential
  - Writes: src/features/usage/**, src/app/features.ts
  - Counters, month summary, usage page with stories, `feature.json`.
  - _Requirements: 7.1 to 7.4, 11.1, 11.2_

- [ ] 11. App composition, routes and end-to-end tests
  - Mode: sequential
  - Writes: src/app/api.ts, src/app/api/**, src/app/login/**, src/app/signup/**, src/app/keys/**, src/app/billing/**, src/app/usage/**, tests/e2e/**, src/app/runtime.ts
  - `src/app/api.ts` builds the pipeline dependencies from the four features. Routes and route stubs (listed in each manifest). End-to-end tests through `Request` and `Response` for every case in design section 8. `pnpm feature disable` for each new feature leaves `pnpm check` green, tried on a clone.
  - _Requirements: 1.3, 6.4, 6.6, 7.2, 9.2, 10.6, 12.1_

- [ ] 12. Docs, gates, the secret name and push
  - Mode: sequential
  - Writes: conformance.config.json, README.md, docs/README.md, docs/provider-ports.md, docs/function-strips-plan.md, docs/environments.md, docs/app-parts-checklist.md, docs/kiroween-script.md, docs/kiroween-submission.md, docs/today/build.mjs, docs/today/index.html, docs/generated/catalog.md, docs/generated/catalog.json
  - Needs the user's unlock for `prodSecretNames`. Regenerate the catalog and the page. Run `pnpm check`, the checker tests, the skeleton tests with the network blocked, and `next build`. Record the prune trials. Push.
  - _Requirements: 8.8, 12.1, 12.2_
