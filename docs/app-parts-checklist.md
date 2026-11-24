---
created: 2026-11-23
updated: 2026-11-24
---

# App Parts Checklist (Draft v0.2)

Scope: paid and freemium APIs with a companion website, server-centered, with occasional mobile apps. Includes optional parts for data-ingestion products and marketplace or logistics apps.
Purpose: a reference list of the parts of an app, so the skeleton template can decide what is core, what is an optional module behind a port, and what is out of scope.

Related: `function-strips-plan.md` (Result and error model, function classes, strips, logging), `provider-ports.md` (ports and adapters), `app-coverage.template.md` (per-app status of every item).

## Logging rule

Steps never call `console` directly. The logger is a port, like the other providers.

- Lint rule `no-console` is on for all source folders. The conformance script checks for it too.
- The logger adapter is the only code allowed to call `console`, because some runtimes (Cloudflare Workers, for example) collect `console` output as their log stream.
- Dev adapter: grouped, readable traces per stripId, with full payloads.
- Production adapter: structured JSON, redacted, with stripId on every line. The platform or a log service collects it.

## Core (goes in the skeleton)

1. **Config and secrets.** Typed, validated env config that fails at startup if a value is missing. Separate dev, staging, and prod. Secrets never in code.
2. **Logging.** The port above, with log levels, redaction of keys and tokens, and stripId on every line.
3. **Error model.** `Result`, `StepError`, and the audience rule from the strips plan.
4. **Validation.** Schema parsing at every boundary: requests, responses, cache, DB rows, env.
5. **Database.** A port for repositories, atomic writes, and migrations. Seeding. A rule for strips that write.
6. **Auth.** Two kinds that are often confused:
   - Human auth for the website: sessions or JWTs, login providers, password reset, email verification.
   - API auth for customers' code: API keys (issued, hashed at rest, rotated, revoked), and possibly OAuth later.
7. **Authorization.** Roles, ownership checks ("can this user see this record?"), and plan-based entitlements. Kept separate from auth.
8. **Testing.** Unit tests for pure steps, contract tests for adapters, a few end-to-end strip tests, Storybook for UI.
9. **CI and DevOps basics.** Lint, typecheck, tests, and the conformance script on every push. Build and deploy pipelines, environment promotion, rollback.

## Money and usage

10. **Payments and billing.** A provider port: checkout, subscriptions, invoices, refunds. Webhooks need signature verification and idempotency, because providers resend events. The provider depends on where the business and customers are (for example, Paystack for Nigeria and Ghana, Stripe elsewhere), which is a reason the port exists.
11. **Plans and entitlements.** Which plan allows which endpoints, limits, and features. Stored as data, not scattered `if (plan === "pro")` checks.
12. **Metering and usage tracking.** Count requests per key, per endpoint, per period. Feeds billing, quotas, and the customer dashboard.
13. **Rate limiting and quotas.** Per key, per plan, and per IP. Clear `429` responses with retry headers. Freemium usually needs a short burst limit and a monthly quota. Counters need a strongly consistent store, not an eventually consistent cache.
14. **Abuse and fraud controls.** Free-tier signup abuse, key sharing, card testing. Plan the hooks early (IP, device, email checks).

## API surface

15. **API design conventions.** Versioning, pagination, error response format, idempotency keys for writes, consistent status codes. Map `StepError.kind` to HTTP status in one place.
16. **API documentation.** OpenAPI spec generated from the schemas, so docs and code cannot drift.
17. **API keys portal.** Create, view once, rotate, and revoke keys on the website.
18. **SDKs and examples.** Generated or hand-written client snippets. Optional.
19. **Outbound webhooks.** If customers need event callbacks: signing, retries, a delivery log.

## Observability

20. **Structured logs and log search.**
21. **Metrics.** Request rate, error rate, latency percentiles, queue depth, per-strip step timings.
22. **Tracing.** The stripId acts as a trace ID that follows calls across services.
23. **Error tracking.** Sentry-style grouping, with source maps for the website and mobile app.
24. **Alerting and uptime checks.** Alerts on error rate, latency, failed webhooks, and failed payments.
25. **Audit log.** Who changed what (plan changes, key creation, admin actions). Separate from debug logs and kept longer.
26. **Status page.** Often expected for paid APIs.

## Operations and infrastructure

27. **Deployment target.** Containers, serverless, or a managed platform. Hosting target for the web and API: Cloudflare Workers through the OpenNext adapter. Databases and background programs may be hosted elsewhere, per app. Infrastructure-as-code if more than one environment is managed.
28. **Environments.** Profiles (`local`, `dev`, optional `staging`, `prod`) chosen by one variable. `local` runs fully offline with seeded demo data. Each environment has its own database and credentials, a startup guard refuses mismatched hosts, and destructive commands refuse to run on production. See `environments.md`.
29. **Background jobs and queues.** Email sending, webhook retries, usage aggregation, scheduled tasks. Jobs get the same strip and logging treatment as requests. Handlers are idempotent, since delivery is at least once.
30. **Caching.** A cache port for hot reads and sessions, with versioned entries, corrupt entries treated as misses, a declared invalidation rule, and a tested "cache off" configuration. Browser storage follows the same rules.
31. **File storage.** Object storage port, if users upload files or the app keeps raw snapshots.
32. **Backups and recovery.** Database backups, tested restores, a documented recovery plan.
33. **Security hardening.** HTTPS, CORS, security headers, CSRF for the website, input size limits, dependency scanning, secret scanning in CI.

## Product and user-facing

34. **Transactional email.** Verification, receipts, password reset, usage warnings, failed-payment notices. A mailer port.
35. **Website pieces.** Marketing and pricing pages, signup, dashboard (usage, billing, keys), docs, and the toast and error UI.
36. **Admin tools.** Look up a user, change a plan, reissue a key, read recent strip logs by stripId.
37. **Analytics.** Product analytics, signup and conversion funnels, a privacy-friendly option if needed.
38. **Legal and compliance.** Terms, privacy policy, cookie consent, data export and deletion, tax handling for payments (a merchant-of-record provider can take much of this on), and small PCI scope by never handling card data directly.
39. **Feature flags.** Roll out to some users or plans, and switch features off quickly.
40. **Internationalization.** Only if more than one language or currency is needed.

## Mobile (occasional)

41. **Shared API client** generated from the OpenAPI spec, so mobile and web call the API the same way.
42. **Mobile auth.** Token storage in the platform's secure storage, refresh flow, biometric options.
43. **Push notifications.** A port for the push provider.
44. **App store billing.** If the app sells subscriptions, store rules usually require the store's in-app purchase system, which differs from the web payment flow. Check current store policy per app.
45. **Offline and sync.** Only if the app needs it. Matters most on unreliable connections.
46. **Crash reporting and release process.** App store review, staged rollout.
47. **Force-update mechanism.** Old app versions keep calling the API, so plan a way to retire them, along with API versioning.

## Skeleton internals (these keep the other parts consistent)

48. **Provider ports and contract tests.** Each port has a real adapter, an in-memory adapter, a tested error mapping, and one shared contract suite. See `provider-ports.md`.
49. **Step manifests, permission budgets, and catalog.** Every step declares input, output, and permissions. Every strip declares a budget. A generated catalog lists them.
50. **Conformance checks and agent guardrails.** A script that lists every violation of the rules, hooks that run it before the agent can stop, and steering files loaded by file pattern.

## Data ingestion and sourcing (for apps that collect or republish external data)

51. **Ingestion pipeline.** Scheduled fetch, parse, validate, compare with stored data, write, invalidate caches. It can run as a separate program in any language (for example a Go scraper writing into the app's database), outside the skeleton's runtime. Parsers are pure functions tested on saved page snapshots, so a changed source layout is caught by a failing test and an alert, and existing data stays in place.
52. **Source terms and licensing.** Check each source's terms and license before collecting or redistributing its content, especially for a paid API. Public availability does not mean commercial reuse is allowed. Record the decision per source.
53. **Provenance and freshness.** Each record keeps its source, source URL, fetch time, and license note. The API returns them.
54. **Search and indexing.** Fuzzy name search, synonyms and alternate names, ranking.
55. **AI features and output safeguards.** An `Llm` port, answers grounded in stored records with the source shown, disclaimers where wrong answers could cause harm, and logging of prompts and outputs under the privacy rules.

## Marketplace and location (for two-sided, logistics, or booking apps)

56. **Geo and maps.** Geocoding, distance and route estimates, address handling, behind a provider port.
57. **Pricing engine.** Rules for quotes (distance, weight, time, demand), written as pure steps with table-driven tests, so prices are explainable and stable.
58. **Matching and dispatch.** Finding, offering, accepting, and reassigning work between sides of the marketplace.
59. **Realtime state.** Order status and live locations, with strongly consistent state per order.
60. **Roles and verification.** Several user roles (customer, provider, shop, admin) and identity or document checks for providers.
61. **Payouts, splits, and disputes.** Holding funds, paying providers, platform fees, refunds, and dispute handling.
62. **Ratings and reviews.**
63. **SMS and messaging notifications.** SMS, WhatsApp, or push at status changes, behind a notifier port.

## Suggested first build order (skeleton)

1. Items 1 to 4 and 48 to 50: error model, step and strip definitions, ports, catalog, and the conformance script with its Stop hook. Everything else depends on these.
2. Items 5, 8, and 9: database port with two adapters, testing, CI.
3. Items 6, 7, and 10 to 13: auth, authorization, payments, entitlements, metering, rate limits.
4. Items 20 to 24: observability basics.
5. Items 15 to 17: API conventions, docs, keys portal.
6. Optional modules (data ingestion, marketplace, mobile) with a port defined and no adapter until an app needs them.

## Competition note (Kiroween 2026, Skeleton Crew category)

Entries describe the category as a template lean enough to be clear but flexible enough to support two distinct apps. The two proving apps are planned as separate repositories created from this template: a medicine data API and a logistics marketplace. They exercise different parts of the skeleton (ingestion and metering for one, geo, realtime, and payouts for the other). The official rules should be read on Devpost to confirm requirements (for example, whether two demo apps are mandatory and how they must be shown). Submissions close December 4 at 2:00 PM PT, per kiro.dev/events. A small number of areas working end to end, plus a clear module pattern for the rest, will likely show better than a long list of stubs.

## Answers recorded so far

- Areas that caused trouble before: all of them, especially functions shaped to one provider (SQL), cache and local storage errors when switching providers or turning them off, stale or corrupted data after refreshes, similarly named functions confused with each other, and agents reusing a step with the wrong arguments, outputs, or permissions, or with a larger permission scope than needed (mostly database and storage).
- Providers expected to swap: SQL database, cache, local storage, object storage, payments.
- Hosting target for the web and API: Cloudflare. Databases and ingestion are per app: the medicine data app plans a Go scraping script with PocketBase (SQLite).
- Proving apps: two, in separate repositories.
- Environments: each app must build and run offline on a PC for development and demos, and keep separate dev data after production launches. Production may use a different database than development (one app may move to a hosted Postgres-based provider).

## Open questions

Decided in `function-strips-plan.md`, section 17: own code for the core, server-only strips, template repository for apps, auth through a library, skeleton scope (core first, then billing and limits, with ingestion and marketplace staying in the apps until two apps need them), and no raw queries on the database port.

Still open:

1. Which auth library.
2. Mailer, notifier, and LLM providers.
3. Per app: where PocketBase is hosted and how the web and API reach it.

## Status in this template (2026-11-24)

Built in the skeleton: items 1 to 9 and 48 to 50 (earlier specs), and in `platform-parts`: 6 auth (local email and password, sessions), 7 authorization (helpers, ownership, roles), 10 payments (port, fake and Paystack adapters, webhook with signature check and idempotency), 11 plans and entitlements (as data), 12 metering, 13 rate limits and quotas, 17 API keys portal. Not built: password reset and email verification, the audit log (25), a hosted rate limiter that works across instances, and any item not named here.
