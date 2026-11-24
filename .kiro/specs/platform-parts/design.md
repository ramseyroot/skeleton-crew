---
created: 2026-11-23
updated: 2026-11-23
---

# Design: Platform Parts

Implements `requirements.md` (A1 to A13 confirmed). Items marked **(proposed)** are new defaults, listed as G1 to G9 in the last section.

## 1. Facts from the code that shape the design

- The example feature already owns a collection named `users` (display names), and two features may not declare the same collection. So the accounts feature uses `accounts` and `sessions`. The example `profile` feature stays untouched.
- Rule R25 matches a profile's adapter key to the adapter folder, so the new ports have one-word names: `auth`, `payments`, `limiter`.
- A profile's `allowedHosts` for `dev` may not share a host with `prod` (R24 and the startup guard). Paystack uses one host for test and live, so `dev` cannot use the `paystack` adapter. `dev` uses `fake`, and only `prod` uses `paystack`.
- Strips and steps log their payloads in `local` and `dev`. A password or a key in a step's input would appear in the log. Requirement 12.3 forbids that, so steps and strips get a `sensitive` flag (section 7).
- The Database port has no atomic increment. The database rate limiter serializes calls per key inside one process (section 3.3). Several server processes need the planned Durable Object adapter.

## 2. Layout

```
src/
  ports/            auth.ts  payments.ts  limiter.ts
  adapters/
    auth/           local/ memory/            + contract.test.ts
    payments/       fake/ paystack/ none/     + contract.test.ts
    limiter/        memory/ database/         + contract.test.ts
  lib/
    principal.ts    Principal type, helpers
    authz.ts        requireSignedIn, requireOwner, requireRole
    http.ts         status mapping, error body, headers, the API pipeline
  features/
    accounts/       users and sessions, endpoint me, login and sign-up pages
    api-keys/       create, verify, list, revoke, rotate; keys page
    billing/        plans, subscriptions, checkout, webhook; billing page, fake checkout page
    usage/          counters, monthly totals; usage page
  app/
    api.ts          composes the features into the pipeline (the only place that knows all of them)
    api/v1/me/route.ts, api/webhooks/payments/route.ts, login/, keys/, billing/, usage/   route stubs
```

Features import only their own folder, `src/lib`, `src/ports`, `src/shared`. `src/app/api.ts` may import each feature through its `index.ts`.

## 3. The three new ports

All methods return `Promise<Result<...>>`. Adapters build errors with `portError`.

### 3.1 Auth (`src/ports/auth.ts`)

```ts
export type Role = "user" | "admin";
export type Account = { id: string; email: string; role: Role; createdAt: string };
export type SessionToken = { token: string; expiresAt: string };   // `token` is returned once

export interface Auth {
  readonly name: string;
  createAccount(input: { email: string; password: string; role?: Role }): Promise<Result<Account>>;   // conflict if the email exists, validation for a weak password
  verifyPassword(email: string, password: string): Promise<Result<Account>>;                          // unauthorized, the same error for an unknown email and a wrong password
  getAccount(accountId: string): Promise<Result<Account>>;                                            // not_found when unknown
  createSession(accountId: string): Promise<Result<SessionToken>>;
  verifySession(token: string): Promise<Result<Account>>;                                             // unauthorized when unknown, ended or expired
  endSession(token: string): Promise<Result<void>>;
  endAllSessions(accountId: string): Promise<Result<void>>;
}
export const AUTH_COLLECTIONS: CollectionDef[];   // `accounts` and `sessions`, used by the adapter and the accounts feature
```

- **local adapter** (deps: database, clock, ids): scrypt with a 16-byte random salt (`node:crypto`), comparison with `timingSafeEqual`. For an unknown email it still runs one scrypt on a dummy salt, so timing is similar. Session tokens are 32 random bytes in base64url, stored as a SHA-256 hash, 7 days (**G1**). Emails are lowercased by the database port (`normalize: "lower"` on a key field, as in the profile example).
- **memory adapter**: the same behavior over plain maps, with the same contract suite.
- The password policy (10 characters) lives in the port file as a helper both adapters call, with the written user message.

### 3.2 Payments (`src/ports/payments.ts`)

```ts
export type Money = { amountMinor: number; currency: string };      // integer minor units, ISO currency code
export type PaymentEvent =
  | { id: string; type: "payment.succeeded" | "payment.failed"; reference: string; accountId: string; planId: string; money: Money }
  | { id: string; type: "subscription.cancelled"; reference: string; accountId: string };

export interface Payments {
  readonly name: string;
  readonly capabilities: { refund: boolean; payout: boolean; split: boolean };
  createCheckout(input: { accountId: string; email: string; planId: string; money: Money; returnUrl: string }): Promise<Result<{ url: string; reference: string }>>;
  getSubscription(reference: string): Promise<Result<{ status: "active" | "cancelled" | "unknown" }>>;
  cancelSubscription(reference: string): Promise<Result<void>>;
  /** Verifies the signature against the raw body and parses the event. `unauthorized` for a bad signature, `validation` for an unknown shape. */
  parseWebhook(input: { headers: Record<string, string>; rawBody: string }): Promise<Result<PaymentEvent>>;
}
```

- **fake adapter** (offline): keeps pending checkouts in memory, returns the URL `/billing/fake-checkout?reference=<ref>`, and offers `signedEvent(reference, outcome)` that returns `{ headers, rawBody }` signed with HMAC-SHA512 and a fixed fake secret. The fake checkout page calls the real webhook handler with that, so the signature check runs offline.
- **paystack adapter**: `POST https://api.paystack.co/transaction/initialize` with `Authorization: Bearer <secret>` and `email`, `amount` (minor units), `reference`, `callback_url`, `metadata`; it reads `data.authorization_url` and `data.reference`. Webhooks carry `x-paystack-signature`, the hex HMAC-SHA512 of the raw body keyed with the secret key. Events mapped: `charge.success` to `payment.succeeded`, `invoice.payment_failed` to `payment.failed`, `subscription.disable` to `subscription.cancelled`. The factory takes `fetch` so tests use recorded responses. These facts come from search results about the Paystack docs, because the docs site refused my fetch, and they are re-checked when the builder supplies a test key (**G2**). Capabilities: all false.
- **none adapter**: every call returns `forbidden` ("payments are not configured"). It lets an app that pruned billing run in prod without a provider.

### 3.3 RateLimiter (`src/ports/limiter.ts`)

```ts
export type Rule = { limit: number; windowMs: number };
export type Allowance = { allowed: boolean; limit: number; remaining: number; resetAt: string; retryAfterSeconds: number };
export interface RateLimiter { readonly name: string; check(key: string, rule: Rule): Promise<Result<Allowance>> }
```

Exceeding a limit is a normal value (`allowed: false`), not an error; the pipeline turns it into a 429. A store failure is an error, and the pipeline fails open (requirement 6.5). Fixed windows start at multiples of `windowMs` from the epoch. `memory` counts in a map and prunes old windows. `database` counts in a `rate_windows` collection (key `<key>:<windowStart>`, count), and serializes `check` per key with a promise chain, so two concurrent calls at the limit cannot both pass inside one process (requirement 6.6).

**Deviation from requirement 6.3, for review (G3).** The monthly quota is not a second set of counters in the limiter. It is read from the metering counters (section 5.4), so the quota and the usage page agree by construction (requirement 7.2). The limiter handles the per-minute window and the per-IP window only.

## 4. Principal, errors and the pipeline

`src/lib/principal.ts`:

```ts
export type Principal =
  | { kind: "user"; accountId: string; role: Role }
  | { kind: "key"; accountId: string; keyId: string }
  | { kind: "anonymous"; ip: string };
```

`src/lib/http.ts` has three parts.

1. `statusOf(kind)`, the one mapping table (requirement 10.2, **G4**: 400, 401, 403, 404, 409, 429, 502, 503, 500), and `errorBody(kind, message, requestId)`.
2. `rateLimitHeaders(allowance)` for `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` and `Retry-After`.
3. `createApiHandler(deps)`, which returns `handle(request, endpoint)` using only web-standard `Request` and `Response`, so it runs in Node tests without Next.js.

```ts
export type ApiDeps = {
  ports: () => Promise<Ports>;
  authenticate(request: Request, ports: Ports, mode: AuthMode): Promise<Result<Principal>>;
  limitsFor(principal: Principal, ports: Ports): Promise<Result<{ perMinute: number; perMonth: number; features: string[] }>>;
  usedThisMonth(principal: Principal, ports: Ports): Promise<Result<number>>;
  record(entry: { principal: Principal; endpoint: string; status: number }, ports: Ports): Promise<Result<void>>;
};
export type Endpoint<I, O> = {
  name: string;                                   // for metering and logs, for example "me.get"
  auth: "key" | "session" | "either" | "none";
  feature?: string;                               // an entitlement the plan must allow
  input(request: Request, principal: Principal): Promise<unknown> | unknown;
  strip: Strip<I, O>;
  status?: number;                                // success status, default 200
};
```

Order: request id, authenticate, per-minute limit (and per-IP for anonymous), monthly quota, entitlement, the strip, then respond and record. A failure before the strip answers with its own generated request id. After a strip, `x-request-id` is the strip's `stripId`. Recording never changes the response (requirement 7.4). The app's `src/app/api.ts` builds `ApiDeps` from the features' exported strips, so the pipeline imports no feature (requirement 10.5).

## 4a. Authorization helpers

`src/lib/authz.ts` holds three plain functions that return a `Result` and make no I/O: `requireSignedIn(principal)` (`unauthorized` for anonymous), `requireOwner(principal, ownerAccountId)` (`forbidden` unless the principal's account is the owner, or an admin), and `requireRole(principal, role)`. Feature steps call them at the top of their `run`. They are plain functions and not steps (**G10**), because a step has exact input and output types and cannot sit in a chain as a pass-through check. This changes the wording of requirement 4.1 from "steps" to "helpers" and nothing else.

## 5. The four features

Collections use only string, number and boolean fields, so structured data is stored as a JSON string. Times are ISO strings.

### 5.1 `accounts`
Collections: none of its own beyond `AUTH_COLLECTIONS` (`accounts`, `sessions`). Steps: `pure.accounts.parseSignup`, `pure.accounts.parseLogin`, and these that call the Auth port (class `db`, `uses: ["auth"]`, `sensitive` where a password or token passes): `db.accounts.create`, `db.accounts.verifyPassword`, `db.accounts.createSession`, `db.accounts.verifySession`, `db.accounts.endSession`, `db.accounts.get`. Strips, each step used by exactly one strip: `accounts.signup` (parse, create), `accounts.login` (parse, verify password), `accounts.start` (create session, used by the actions after signup or login), `accounts.logout`, `accounts.whoami` (verify session), `accounts.me` (get). Endpoint `me.get` runs `accounts.me`. Pages: log in and sign up with Server Actions that set an `HttpOnly`, `SameSite=Lax`, `Secure` (outside local) cookie. Seed: one demo account (outside prod).

### 5.2 `api-keys`
Collection `api_keys`: `accountId` (indexed), `name`, `prefix` (unique), `keyHash` (unique), `expiresAt`, `revokedAt`, `lastUsedAt` (optional strings). Key = `sk_<prefix>_<secret>`. The prefix is 8 characters and the secret is 48 characters, both made from the IdGenerator port (letters and digits only), so tests are deterministic. The hash is SHA-256 of the whole key. Verification looks the row up by prefix, compares hashes with `timingSafeEqual`, checks revoked and expiry, then writes `lastUsedAt` (best effort). Steps: `pure.keys.parseCreate`, `db.keys.create`, `db.keys.verify`, `db.keys.touch`, `db.keys.list`, `db.keys.revoke`, `db.keys.rotate` (create the new key and revoke the old one in one `batch`). Key generation is a plain helper in the feature (`keygen.ts`), not a step. Strips: `keys.create` (parse, create; returns the full key once), `keys.verify` (verify, touch), `keys.list`, `keys.revoke`, `keys.rotate`. Page: the keys portal. Every strip that handles a key is `sensitive`.

### 5.3 `billing`
Collections: `plans` (`name` unique, `priceMinor`, `currency`, `perMinute`, `perMonth`, `features` as a JSON string), `subscriptions` (`accountId` unique, `planId`, `status`, `reference`), `payment_events` (`eventId` unique, for idempotency). Seed `free` and `pro` (**G5**). Steps: `pure.billing.parseCheckout`, `db.billing.findPlan`, `api.billing.createCheckout`, `api.billing.parseWebhook`, `db.billing.recordEvent` (create a `payment_events` row, `conflict` means already handled, returned as `duplicate: true`), `db.billing.setPlan` (does nothing for a duplicate), `db.billing.currentPlan`, `pure.billing.planAllows`, `db.billing.findSubscription`, `api.billing.cancelSubscription`, `db.billing.markCancelled`. Strips: `billing.checkout` (parse, find plan, create checkout), `billing.webhook` (parse, record, set plan), `billing.plan` (current plan and limits for an account), `billing.entitlement` (plan allows a feature), `billing.cancel`. Pages: billing, and the fake checkout page (only reachable when the fake adapter is active). The webhook route reads `await request.text()` for the raw body and answers 200 once the event is stored, 401 for a bad signature, 500 when it should be retried.

### 5.4 `usage`
Collection `usage_counters`: `counterKey` (unique, `<keyId>:<endpoint>:<day>`), `monthKey` (indexed, `<accountId>:<YYYY-MM>`), `accountId`, `endpoint`, `day`, `ok`, `clientError`, `serverError` (numbers). Steps: `db.usage.increment` (create the counter row or add one to it), `db.usage.listMonth`, `pure.usage.summarize`. Strips: `usage.record` (increment) and `usage.month` (list, summarize). `usedThisMonth` for the quota sums those rows. Page: usage this month, by endpoint.

## 6. Config, profiles, secrets

- Profiles gain `auth` (`local` or `memory`), `payments` (`fake`, `paystack`, `none`), `limiter` (`memory`, `database`). Gating in the schema: `prod` may not use `memory` for `auth` or `limiter`, may not use `fake` for `payments`, and `local` and `dev` may not use `paystack` (**G6**). Shipped values: local and dev use `local`, `fake`, `memory`; prod uses `local`, `paystack`, `database`.
- `allowedHosts` of `prod` gains `api.paystack.co`. The `paystack` registry entry declares that host, so the startup guard checks it.
- Settings gain `paystackSecret`, read from `PAYSTACK_SECRET_KEY`. `compose` reports a missing key when the `paystack` adapter is selected, like the database path.
- `prodSecretNames` in `conformance.config.json` gets `PAYSTACK_SECRET_KEY` (protected, **your unlock**, one line, in the last task).
- `Ports` gets `auth`, `payments`, `limiter`, and `PortName` gets `auth` and `payments`, so steps can declare them in `uses`. The limiter is used by the pipeline only. Auth and payments have no per-collection narrowing in the step context (like `clock`), so their adapters are the boundary.

## 7. The `sensitive` flag

`defineStep` and `defineStrip` take an optional `sensitive: true`. The step wrapper and the runner then log no input, no output and no error message for that step or strip (only names, timing and the error kind), in every environment. The reporter receives no message for a sensitive strip either. Steps handling passwords, tokens or keys set it. A test per feature feeds a known secret through the strip and asserts that the memory logger, the reporter and the metrics hold no trace of it (requirement 12.3). This edits `src/lib/step.ts` and `src/lib/strip.ts`, and is listed in the change plan.

## 8. Tests

- **Contract suites** for `Auth`, `Payments` and `RateLimiter`, run against every adapter. The `paystack` adapter's tests use recorded request and response fixtures stored next to it, with `fetch` injected, and a signed-webhook fixture.
- **Strip tests** for every strip, with both database adapters where a database is involved.
- **End to end through the pipeline** with `Request` and `Response`: a key request succeeds and is metered, the 61st request in a minute gets a 429 with headers, the quota stops a key at its monthly limit, a plan change after a verified webhook raises the limits, a replayed webhook changes nothing, a bad signature is a 401, a revoked key is a 401, an error shows only a reference.
- **Secret leakage**: each sensitive strip, as in section 7.
- **Prune trials**: each of the four features is disabled in turn on a clone, and `pnpm check` plus the tests stay green (requirement 1.3).
- Everything runs with the network blocked.

## 9. Dependencies

None. `node:crypto` (scrypt, HMAC, SHA-256, `timingSafeEqual`, random bytes) and the platform `fetch` and `Request` and `Response`.

## 10. Order of work

1. Pipeline and `sensitive` (edits two library files).
2. and 3. `RateLimiter` and `Auth` ports with adapters (two parallel worktrees, new files only).
4. `Payments` port with adapters and recorded fixtures.
5. Wire the ports: `Ports`, `PortName`, registry, profiles, compose, test helpers.
6. The authorization helpers (`lib/authz.ts`).
7. to 10. The four features, one task each.
11. App composition, routes, end-to-end tests.
12. Docs, prune trials, offline run, page, the secret name (unlock), push.

## 11. New defaults awaiting your decision

| # | Proposal | Alternative | State |
|---|---|---|---|
| G1 | Sessions are 32 random bytes in base64url, stored as SHA-256, valid 7 days, set in an `HttpOnly` `SameSite=Lax` cookie (`Secure` outside local) | Longer or sliding sessions | confirmed (user, 2026-11-23) |
| G2 | The Paystack request and webhook details above come from search results about the docs and are re-checked with a test key | Wait for the docs | confirmed (user, 2026-11-23) |
| G3 | The monthly quota reads the metering counters, and the limiter only does per-minute and per-IP windows | Two sets of counters | confirmed (user, 2026-11-23) |
| G4 | The error kind to HTTP status table of requirement 10.2 | Another mapping | confirmed (user, 2026-11-23) |
| G5 | The `free` and `pro` plans are seeded in the billing feature by its `seed` | A migration file | confirmed (user, 2026-11-23) |
| G6 | Profile gating: prod may not use `memory` for auth or limiter, nor `fake` payments. Local and dev may not use `paystack` | Looser gating | confirmed (user, 2026-11-23) |
| G7 | A `none` payments adapter exists, so an app without billing runs in prod | Require Paystack in prod | confirmed (user, 2026-11-23) |
| G8 | A `sensitive` flag on steps and strips suppresses all payload logging for them | Redact by field name | confirmed (user, 2026-11-23) |
| G9 | Collections use `accounts` and `sessions`, not `users`, so the example `profile` feature stays as it is | Rename the example's collection | confirmed (user, 2026-11-23) |
| G10 | Authorization checks are plain helper functions in `src/lib/authz.ts`, not steps (requirement 4.1 reworded) | Pass-through steps | confirmed (user, 2026-11-23) |
