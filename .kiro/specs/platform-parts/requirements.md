---
created: 2026-11-23
updated: 2026-11-24
---

# Requirements Document: Platform Parts

## Introduction

Zidolia and MiniCargo are paid or freemium products. The builder confirmed on 2026-11-23 that **both apps share every platform part**, so all of them belong in the template: people can sign up and log in, customers get API keys, plans decide what a customer may do, requests are limited and counted, and money is taken through a payments provider.

This spec adds those parts to the template as **features and ports** in the feature layout, so an app that does not need one can disable and prune it. It covers checklist items 6, 7, 10 to 13, 15 and 17 of `docs/app-parts-checklist.md`, plus the minimum website pages to use them.

It does not cover: email (verification, reset, receipts: no `Mailer` port yet), abuse and fraud controls (item 14), generated API documentation (item 16), a hosted deployment, or the two apps. Those are listed as `deferred` in the last section.

Everything here must run offline in the `local` profile, with real providers behind ports and an in-memory or local adapter for development, tests and demos, as for every other port.

### Terms

- **Principal**: who is making a request: a signed-in user, an API key, or nobody.
- **Plan**: a named set of limits and allowed features, stored as data.
- **Entitlement**: a yes or no answer to "may this principal do this under its plan?".
- **Window**: a fixed period (a minute, a month) over which requests are counted.

### Proposed defaults

Values marked **(proposed)** are shown for review. They become decisions only when marked `confirmed` or `changed` in the last section.

---

## Requirements

### Requirement 1: Placement in the feature layout

**User Story:** As an app author, I want each platform part to be a feature I can switch off or delete, so that an app takes only what it needs.

#### Acceptance Criteria

1. THE platform parts SHALL be features in `src/features/`, each with a `feature.json`: `accounts` (users, sessions, roles), `api-keys`, `billing` (plans, subscriptions, checkout, webhooks) and `usage` (metering, rate limits, quotas). **(proposed split)**
2. NO platform feature SHALL import another feature (R42). Shared types and helpers SHALL live in `src/shared/` or `src/lib/`, and the app SHALL compose the features, so that disabling one cannot break another.
3. THE template SHALL ship all four enabled, and `pnpm feature disable <name>` for each SHALL leave `pnpm check` green.
4. NEW ports SHALL follow the port rules: domain types only, two adapters or more, a contract suite, an `errors.ts` per adapter, and each recorded as `planned` where a real provider is not built.

### Requirement 2: Accounts and sessions

**User Story:** As a person using a website built from the template, I want to sign up, log in and log out, so that my data is mine.

#### Acceptance Criteria

1. THE `Auth` port SHALL provide: create an account with an email and a password, check a password, create a session, verify a session token, end a session, and end all of a user's sessions.
2. THE port SHALL have a `local` adapter that stores users and sessions through the Database port, and a `memory` adapter. Hosted adapters (PocketBase auth, Supabase auth) SHALL be recorded as `planned`, because an app that uses one of those platforms would use its own login. **(proposed: no third-party auth library for now)**
3. PASSWORDS SHALL be hashed with `scrypt` from `node:crypto` with a per-user salt, and SHALL never be stored, logged or returned.
4. A SESSION token SHALL be random, SHALL be stored only as a hash, SHALL expire (**proposed: 7 days**), and SHALL be ended by log-out.
5. A failed log-in SHALL return the same `unauthorized` error whether the email exists or not, and SHALL take a similar time.
6. EMAILS SHALL be compared case-insensitively and SHALL be unique.
7. A password SHALL have at least 10 characters **(proposed)**. A weaker one SHALL be a `validation` error with a written user message.

### Requirement 3: API keys

**User Story:** As a customer, I want API keys for my code, so that I can call the API without a browser session.

#### Acceptance Criteria

1. THE `api-keys` feature SHALL create a key for a user, show the full key **once**, and store only a hash and a short prefix. **(proposed format: `sk_<8-character id>_<32 random characters>`)**
2. THE feature SHALL verify a presented key in constant time, SHALL reject revoked and expired keys, and SHALL record when a key was last used.
3. A user SHALL be able to list their keys (prefix, name, created, last used, state), revoke a key, and rotate a key (create a new one and revoke the old one).
4. A KEY SHALL belong to one user and SHALL carry a name and an optional expiry. Per-key scopes SHALL NOT be part of the first version. **(proposed)**
5. KEYS SHALL never appear in logs, errors, metrics tags or error reports. A test SHALL check that a full key never reaches the logger.

### Requirement 4: Authorization

**User Story:** As a developer, I want ownership and role checks in one place, so that "can this principal see this record?" is not scattered through the code.

#### Acceptance Criteria

1. THE template SHALL provide helper functions (`src/lib/authz.ts`) for: does this principal own this record, does it have this role, and is it signed in at all. Each SHALL return `forbidden` or `unauthorized` as appropriate and SHALL do no I/O. (Reworded from "steps" to "helper functions" by design decision G10, confirmed 2026-11-23: a step has exact input and output types and cannot be a pass-through check.)
2. ROLES SHALL be stored on the user (`user`, `admin`) **(proposed)** and SHALL be separate from plan entitlements.
3. A strip that reads or writes a user's record SHALL use the ownership step. The example endpoints SHALL show it.

### Requirement 5: Plans and entitlements

**User Story:** As a product owner, I want what each plan allows stored as data, so that changing a plan is a data change.

#### Acceptance Criteria

1. PLANS SHALL be records with a name, a price in minor units and a currency, a per-minute request limit, a monthly request quota, and a list of allowed feature names. THE template SHALL seed `free` and `pro`. **(proposed numbers: free 60 per minute and 1,000 per month, pro 600 per minute and 100,000 per month)**
2. A USER SHALL have one active subscription at a time, defaulting to `free`.
3. A `pure` step SHALL answer "does this plan allow this feature?" from plan data. NO step SHALL compare a plan name in code.
4. A CHANGE of plan SHALL take effect for the next request.

### Requirement 6: Rate limits and quotas

**User Story:** As an API owner, I want per-key and per-IP limits with clear responses, so that one customer cannot use everything.

#### Acceptance Criteria

1. THE `RateLimiter` port SHALL provide `check(key, rule)` returning allowed, or `rate_limited` with a retry-after value in seconds, and SHALL count in a store with strong consistency.
2. THE port SHALL have a `memory` adapter and a `database` adapter that counts through the Database port. A Durable Object adapter SHALL be recorded as `planned`.
3. THE limiter SHALL use fixed windows: a per-minute window for burst and a monthly window for the quota **(proposed)**. Limits SHALL come from the caller's plan, and an unauthenticated caller SHALL be limited per IP with a fixed low rule.
4. WHEN a limit is exceeded, THEN the response SHALL be HTTP 429 with a `Retry-After` header and the limit, remaining and reset values in headers.
5. THE limiter SHALL fail open when its store fails, SHALL report the failure, and SHALL say so in the log. **(proposed)**
6. A TEST SHALL show that two concurrent requests at the limit cannot both pass, against both adapters.

### Requirement 7: Metering

**User Story:** As an API owner, I want to know how much each key used, so that quotas, billing and dashboards agree.

#### Acceptance Criteria

1. EVERY request that reaches the API pipeline SHALL be counted per key, per endpoint name and per day, and SHALL record its outcome class (success, client error, server error).
2. THE monthly quota in requirement 6 and the usage shown to the customer SHALL read the same counters.
3. A USER SHALL be able to read their usage for the current month, by endpoint.
4. Counting SHALL never fail a request. WHEN counting fails, THEN the failure SHALL be reported and logged.

### Requirement 8: Payments port

**User Story:** As a business owner, I want one payments interface, so that I can use Paystack in Nigeria and Ghana and another provider elsewhere.

#### Acceptance Criteria

1. THE `Payments` port SHALL provide: create a checkout for a plan and a customer, read a subscription, cancel a subscription, and verify and parse a webhook into a domain event.
2. MONEY SHALL be integer minor units plus a currency code. NO float SHALL be used.
3. WEBHOOK verification SHALL check the provider's signature in constant time and SHALL reject a bad one with `unauthorized`.
4. EVENTS SHALL be idempotent: the same provider event delivered twice SHALL change state once.
5. THE port SHALL have a `fake` adapter that works offline (a local checkout page that completes a payment on request and sends a signed event) and a `paystack` adapter. **(proposed: the Paystack adapter is built against recorded responses and tested offline, and is live-tested only if the builder supplies a Paystack test key)**
6. Payouts, splits and refunds SHALL be recorded as capability flags that the Paystack adapter does not claim in the first version.
7. A Stripe adapter SHALL be recorded as `planned`.
8. SECRETS (the Paystack secret key) SHALL come from the environment only, SHALL be absent from `local` and `dev` files, and SHALL be named in `prodSecretNames` so rule R26 protects them. The builder owns that configuration change.

### Requirement 9: Billing

**User Story:** As a customer, I want to upgrade my plan and have it take effect once payment succeeds.

#### Acceptance Criteria

1. A STRIP SHALL start a checkout for a plan, and another SHALL handle the provider's webhook and update the subscription.
2. A PLAN SHALL change only after a verified, new webhook event, never after the browser returns from checkout.
3. FAILED and cancelled payments SHALL leave the plan unchanged and SHALL be logged.
4. THE webhook route SHALL be exempt from sessions and keys, SHALL read the raw body for the signature, and SHALL answer the provider quickly with a status that stops its retries once an event is stored.

### Requirement 10: The API pipeline

**User Story:** As an app author, I want one pipeline that every API endpoint goes through, so that authentication, limits, metering and errors are the same everywhere.

#### Acceptance Criteria

1. A request SHALL go through, in order: request id, principal (session or key), rate limit, entitlement, the endpoint's strip, metering, response.
2. THE `StepError.kind` to HTTP status mapping SHALL exist in exactly one place **(proposed: `validation` 400, `unauthorized` 401, `forbidden` 403, `not_found` 404, `conflict` 409, `rate_limited` 429, `upstream` 502, `network` 503, `unexpected` 500)**.
3. EVERY response SHALL carry the strip reference in an `x-request-id` header. An internal error SHALL return a generic JSON body with that reference and never its message. A user error SHALL return its written message.
4. ERROR bodies SHALL have one shape: `{ "error": { "code": "<kind>", "message": "<text>", "request_id": "<id>" } }`.
5. THE pipeline SHALL be generic code in `src/lib/` and SHALL NOT import any feature. THE app SHALL give it the features' strips, so that disabling a feature removes its behavior without editing the pipeline.
6. THE template SHALL include one example endpoint (for instance `GET /api/v1/me`) that shows the whole path with a key and with a session, tested end to end.

### Requirement 11: Website pages

**User Story:** As a person using the website, I want to log in, manage my keys and see my plan and usage.

#### Acceptance Criteria

1. THE template SHALL include pages for: sign up and log in, an API keys portal (create and see once, list, revoke), and a billing and usage page (current plan, usage this month, upgrade). **(proposed: plain and small)**
2. EVERY page component SHALL receive `Result`-shaped props, SHALL have one Storybook story per end state, and SHALL show user errors as toasts and internal errors as a generic message with the reference.
3. THE key SHALL be shown once, with a clear note, and SHALL not be re-readable.

### Requirement 12: Offline, safe, observable

**User Story:** As the builder, I want the platform parts to follow the template's own rules, so that they are not the exception.

#### Acceptance Criteria

1. THE whole platform SHALL run and test offline, with the network blocked.
2. EVERY new step, strip, port and adapter SHALL pass `pnpm check`, with contract suites for new ports and error-mapping tests for each adapter.
3. NO secret, password, token or full key SHALL appear in logs, error reports, metrics or error messages. Tests SHALL cover each.
4. EVERY strip SHALL report and count through the existing reporter and metrics ports without extra code in the strip.
5. NEW dependencies SHALL be avoided. WHEN one is needed, THEN it SHALL be listed with its reason in the design document. **(proposed: none; use `node:crypto` and `fetch`)**
6. THE example data and the demo accounts SHALL be created only outside `prod`.

---

## Proposed defaults and cut order, awaiting your decision

| # | Proposal | Alternative | State |
|---|---|---|---|
| A1 | No third-party auth library for now: a `local` Auth adapter (scrypt and database sessions) plus a `memory` one, with PocketBase and Supabase auth adapters `planned` per app. This changes the earlier decision "auth uses a library behind a port" | Pick a library (Better Auth, Auth.js) | confirmed (user, 2026-11-23) |
| A2 | Four features: `accounts`, `api-keys`, `billing`, `usage`, composed by the app, never importing each other | Fewer, larger features | confirmed (user, 2026-11-23) |
| A3 | Sessions last 7 days, are random, and are stored hashed. Passwords need 10 characters | Other lifetimes or rules | confirmed (user, 2026-11-23) |
| A4 | Key format `sk_<id>_<secret>`, hashed with SHA-256 at rest, shown once, no scopes in the first version | Scopes now | confirmed (user, 2026-11-23) |
| A5 | Plans `free` (60 per minute, 1,000 per month) and `pro` (600 per minute, 100,000 per month) seeded as data | Other numbers | confirmed (user, 2026-11-23) |
| A6 | Fixed windows (per minute, per month), and fail open when the counter store fails | Token bucket, fail closed | confirmed (user, 2026-11-23) |
| A7 | RateLimiter adapters: `memory` and `database`. Durable Objects `planned` | Memory only | confirmed (user, 2026-11-23) |
| A8 | Paystack adapter built against recorded responses and tested offline. Live-tested only with a test key from you. The `fake` adapter is the default everywhere except `prod` | Fake only, Paystack `planned` | confirmed (user, 2026-11-23) |
| A9 | The error kind to HTTP status table in requirement 10.2 | Another mapping | confirmed (user, 2026-11-23) |
| A10 | Pages are plain and small: log in, keys portal, billing and usage | More polish | confirmed (user, 2026-11-23) |
| A11 | Deferred, not part of this spec: email, abuse controls, OpenAPI, hosting, API idempotency keys | Include some | confirmed (user, 2026-11-23) |
| A12 | No new dependencies | A hashing or auth library | confirmed (user, 2026-11-23) |
| A13 | Cut order if time runs short, first cut first: the pages beyond the keys portal, then the `database` rate limiter (memory only), then the real Paystack adapter (fake only, Paystack `planned`) | Another order | confirmed (user, 2026-11-23) |
