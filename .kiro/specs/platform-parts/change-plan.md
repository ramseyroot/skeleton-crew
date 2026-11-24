---
status: active
created: 2026-11-23
updated: 2026-11-24
---

# Change Plan: Platform Parts

The catalog was read. It lists the five example steps and two strips of the `profile` feature. None of them is reused or changed. Every step and strip below is `new`, and each is used by exactly one strip, so no shared step is needed (R38).

## Strips in this spec

- accounts.signup, accounts.login, accounts.start, accounts.logout, accounts.whoami, accounts.me
- keys.create, keys.verify, keys.list, keys.revoke, keys.rotate
- billing.checkout, billing.webhook, billing.plan, billing.entitlement, billing.cancel
- usage.record, usage.month

## Steps

| Step | Action | Used by (this spec) | Affected strips | Reason | Distinct from |
|---|---|---|---|---|---|
| pure.accounts.parseSignup | new | accounts.signup | | Validates email and password | |
| pure.accounts.parseLogin | new | accounts.login | | Validates the login form | |
| db.accounts.create | new | accounts.signup | | Creates an account through the Auth port | |
| db.accounts.verifyPassword | new | accounts.login | | Checks a password through the Auth port | |
| db.accounts.createSession | new | accounts.start | | Starts a session | |
| db.accounts.endSession | new | accounts.logout | | Ends a session | |
| db.accounts.verifySession | new | accounts.whoami | | Reads who a session token belongs to | |
| db.accounts.get | new | accounts.me | | Reads one account | |
| pure.keys.parseCreate | new | keys.create | | Validates a key name and expiry | |
| db.keys.create | new | keys.create | | Creates a key, returns it once | |
| db.keys.verify | new | keys.verify | | Checks a presented key | |
| db.keys.touch | new | keys.verify | | Records the last use | |
| db.keys.list | new | keys.list | | Lists an account's keys | |
| db.keys.revoke | new | keys.revoke | | Revokes one key | |
| db.keys.rotate | new | keys.rotate | | Creates a new key and revokes the old one together | |
| pure.billing.parseCheckout | new | billing.checkout | | Validates the plan choice | |
| db.billing.findPlan | new | billing.checkout | | Reads one plan | |
| api.billing.createCheckout | new | billing.checkout | | Starts a checkout through the Payments port | |
| api.billing.parseWebhook | new | billing.webhook | | Verifies and parses a webhook | |
| db.billing.recordEvent | new | billing.webhook | | Stores a provider event once | |
| db.billing.setPlan | new | billing.webhook | | Changes an account's plan | |
| db.billing.currentPlan | new | billing.plan | | Reads an account's plan and limits | |
| pure.billing.planAllows | new | billing.entitlement | | Answers whether a plan allows a feature | |
| db.billing.findSubscription | new | billing.cancel | | Reads a subscription | |
| api.billing.cancelSubscription | new | billing.cancel | | Cancels with the provider | |
| db.billing.markCancelled | new | billing.cancel | | Records the cancellation | |
| db.usage.increment | new | usage.record | | Counts one request | |
| db.usage.listMonth | new | usage.month | | Reads a month's counters | |
| pure.usage.summarize | new | usage.month | | Sums counters per endpoint | |

No planned name is a near-duplicate of another planned name or of an existing step: the domains (`accounts`, `keys`, `billing`, `usage`) differ. R39 will confirm.

## Existing files to edit

Existing files in the guarded folders:

| File | Task | Reason |
|---|---|---|
| src/lib/step.ts | 1, 5 | Task 1: optional `sensitive` flag. Task 5: `Ports` gets `auth`, `payments`, `limiter`, and `PortName` gets `auth` and `payments` |
| src/lib/strip.ts | 1 | Optional `sensitive` flag: no payload in logs or reports |
| src/features/profile/** | none | The example feature is not edited |
| src/features/accounts/domain.ts | 8 | One line: the session cookie name is imported from `src/shared/session.ts` instead of defined here, so the accounts feature and the keys page read one constant and no feature imports another (R42). Added during task 8 under the delegation, one existing file of this spec |
| src/lib/feature.ts | 11 | Task 11 decision, see progress.md: a feature module may carry optional `api` parts (who a session or key belongs to, limits, monthly use, recording). `src/app/api.ts` reads them from the `features` list, so it imports no feature and `pnpm feature disable <name>` still leaves the checks green (requirement 1.3). The type is optional, so no existing feature changes behavior |
| src/features/accounts/feature.ts, src/features/api-keys/feature.ts, src/features/billing/feature.ts, src/features/usage/feature.ts | 11 | Each adds its `api` parts, built from its own strips |
| src/features/accounts/index.ts, src/features/billing/index.ts | 11 | Export the `me.get` endpoint and the webhook handler for the route stubs |
| src/features/accounts/feature.json, src/features/billing/feature.json | 11 | List the new route stubs (`/api/v1/me` and `/api/webhooks/payments`) so disable removes them |

Existing files outside the guarded folders:

| File | Task | Reason |
|---|---|---|
| src/config/profiles.ts, registry.ts, compose.ts, profiles.test.ts, compose.test.ts | 5 | Three new adapter keys, gating, the Paystack key and host |
| src/test-utils/ports.ts | 5 | The new ports for tests |
| src/app/features.ts | 7 to 10 | One line per new feature |
| src/app/runtime.ts | 11 | Seeds and the demo account stay as they are, only if a hook is needed |
| conformance.config.json | 12 | `prodSecretNames` gets `PAYSTACK_SECRET_KEY` (protected, unlock) |
| docs/**, README.md, package.json | 12 | Documentation, catalog, page |

## New files

- `src/ports/auth.ts`, `payments.ts`, `limiter.ts`, and `src/adapters/{auth,payments,limiter}/**` (tasks 2 to 4)
- `src/lib/principal.ts`, `authz.ts`, `http.ts` (task 1)
- `src/features/{accounts,api-keys,billing,usage}/**` (tasks 7 to 10)
- `src/app/api.ts`, route stubs and routes under `src/app/` (task 11)

## Affected strip tests

No existing strip or step changes contract. Tasks 1 and 5 edit library code that every strip runs through, so the example strips' tests run as affected tests:

- src/features/profile/strips/profile.save.strip.test.ts
- src/features/profile/strips/profile.view.strip.test.ts

## Execution mode

- **Parallel in worktrees, two at once:** tasks 2 (`limiter`) and 3 (`auth`). They only create new files in separate folders.
- **Sequential:** everything else, because it edits existing files or depends on earlier code. Task 12 needs the user's unlock.

## Decisions

| ID | Topic | Decision | Status | Reason |
|---|---|---|---|---|
| CP1 | Execution | Tasks 2 and 3 in parallel worktrees, the rest sequential | confirmed (user, 2026-11-23) | Disjoint new files are safe in parallel and the worktree command has already been proven |
| CP2 | Unlock | One unlock, in task 12, for the one-line `prodSecretNames` change | confirmed (user, 2026-11-23) | Nothing else here is protected |
| CP3 | Commits | One commit per task | confirmed (user, 2026-11-23) | As in the earlier specs |
