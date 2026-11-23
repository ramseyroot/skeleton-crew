---
created: 2026-11-23
updated: 2026-11-23
---

# App Coverage: <app name>

Copy this file per app (for example `docs/coverage/<app>.md`) and fill in the Status and Reference columns.
Item details are in `app-parts-checklist.md`. Numbers match that file.

Statuses (exact text):

- `planned`: needed, and covered. Reference must be a path to an existing spec, strip, or doc (relative to the repo root).
- `unplanned`: needed, not yet covered. This is a visible gap.
- `not-needed`: deliberately skipped. Reference must give a reason.
- `deferred`: later. Reference must give the trigger (for example, "when we have paying users").

An empty status counts as a gap. Run `node scripts/check-coverage.mjs <this-file>` to check.

| # | Item | Status | Reference or reason |
|---|------|--------|---------------------|
| 1 | Config and secrets | | |
| 2 | Logging | | |
| 3 | Error model | | |
| 4 | Validation | | |
| 5 | Database | | |
| 6 | Auth (human and API) | | |
| 7 | Authorization | | |
| 8 | Testing | | |
| 9 | CI and DevOps basics | | |
| 10 | Payments and billing | | |
| 11 | Plans and entitlements | | |
| 12 | Metering and usage tracking | | |
| 13 | Rate limiting and quotas | | |
| 14 | Abuse and fraud controls | | |
| 15 | API design conventions | | |
| 16 | API documentation | | |
| 17 | API keys portal | | |
| 18 | SDKs and examples | | |
| 19 | Outbound webhooks | | |
| 20 | Structured logs and log search | | |
| 21 | Metrics | | |
| 22 | Tracing | | |
| 23 | Error tracking | | |
| 24 | Alerting and uptime checks | | |
| 25 | Audit log | | |
| 26 | Status page | | |
| 27 | Deployment target | | |
| 28 | Environments | | |
| 29 | Background jobs and queues | | |
| 30 | Caching | | |
| 31 | File storage | | |
| 32 | Backups and recovery | | |
| 33 | Security hardening | | |
| 34 | Transactional email | | |
| 35 | Website pieces | | |
| 36 | Admin tools | | |
| 37 | Analytics | | |
| 38 | Legal and compliance | | |
| 39 | Feature flags | | |
| 40 | Internationalization | | |
| 41 | Shared API client (mobile) | | |
| 42 | Mobile auth | | |
| 43 | Push notifications | | |
| 44 | App store billing | | |
| 45 | Offline and sync | | |
| 46 | Crash reporting and release process | | |
| 47 | Force-update mechanism | | |
| 48 | Provider ports and contract tests | | |
| 49 | Step manifests, budgets, and catalog | | |
| 50 | Conformance checks and agent guardrails | | |
| 51 | Ingestion pipeline | | |
| 52 | Source terms and licensing | | |
| 53 | Provenance and freshness | | |
| 54 | Search and indexing | | |
| 55 | AI features and output safeguards | | |
| 56 | Geo and maps | | |
| 57 | Pricing engine | | |
| 58 | Matching and dispatch | | |
| 59 | Realtime state | | |
| 60 | Roles and verification | | |
| 61 | Payouts, splits, and disputes | | |
| 62 | Ratings and reviews | | |
| 63 | SMS and messaging notifications | | |
