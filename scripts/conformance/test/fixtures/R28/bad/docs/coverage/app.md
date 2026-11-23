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
| 1 | Config and secrets | not-needed | not part of this fixture |
| 2 | Logging | planned | docs/missing.md |
| 3 | Error model | unplanned |  |
| 4 | Validation | not-needed | not part of this fixture |
| 5 | Database | not-needed | not part of this fixture |
| 6 | Auth (human and API) | not-needed | not part of this fixture |
| 7 | Authorization | not-needed | not part of this fixture |
| 8 | Testing | not-needed | not part of this fixture |
| 9 | CI and DevOps basics | not-needed | not part of this fixture |
| 10 | Payments and billing | not-needed | not part of this fixture |
| 11 | Plans and entitlements | not-needed | not part of this fixture |
| 12 | Metering and usage tracking | not-needed | not part of this fixture |
| 13 | Rate limiting and quotas | not-needed | not part of this fixture |
| 14 | Abuse and fraud controls | not-needed | not part of this fixture |
| 15 | API design conventions | not-needed | not part of this fixture |
| 16 | API documentation | not-needed | not part of this fixture |
| 17 | API keys portal | not-needed | not part of this fixture |
| 18 | SDKs and examples | not-needed | not part of this fixture |
| 19 | Outbound webhooks | not-needed | not part of this fixture |
| 20 | Structured logs and log search | not-needed | not part of this fixture |
| 21 | Metrics | not-needed | not part of this fixture |
| 22 | Tracing | not-needed | not part of this fixture |
| 23 | Error tracking | not-needed | not part of this fixture |
| 24 | Alerting and uptime checks | not-needed | not part of this fixture |
| 25 | Audit log | not-needed | not part of this fixture |
| 26 | Status page | not-needed | not part of this fixture |
| 27 | Deployment target | not-needed | not part of this fixture |
| 28 | Environments | not-needed | not part of this fixture |
| 29 | Background jobs and queues | not-needed | not part of this fixture |
| 30 | Caching | not-needed | not part of this fixture |
| 31 | File storage | not-needed | not part of this fixture |
| 32 | Backups and recovery | not-needed | not part of this fixture |
| 33 | Security hardening | not-needed | not part of this fixture |
| 34 | Transactional email | not-needed | not part of this fixture |
| 35 | Website pieces | not-needed | not part of this fixture |
| 36 | Admin tools | not-needed | not part of this fixture |
| 37 | Analytics | not-needed | not part of this fixture |
| 38 | Legal and compliance | not-needed | not part of this fixture |
| 39 | Feature flags | not-needed | not part of this fixture |
| 40 | Internationalization | not-needed | not part of this fixture |
| 41 | Shared API client (mobile) | not-needed | not part of this fixture |
| 42 | Mobile auth | not-needed | not part of this fixture |
| 43 | Push notifications | not-needed | not part of this fixture |
| 44 | App store billing | not-needed | not part of this fixture |
| 45 | Offline and sync | not-needed | not part of this fixture |
| 46 | Crash reporting and release process | not-needed | not part of this fixture |
| 47 | Force-update mechanism | not-needed | not part of this fixture |
| 48 | Provider ports and contract tests | not-needed | not part of this fixture |
| 49 | Step manifests, budgets, and catalog | not-needed | not part of this fixture |
| 50 | Conformance checks and agent guardrails | not-needed | not part of this fixture |
| 51 | Ingestion pipeline | not-needed | not part of this fixture |
| 52 | Source terms and licensing | not-needed | not part of this fixture |
| 53 | Provenance and freshness | not-needed | not part of this fixture |
| 54 | Search and indexing | not-needed | not part of this fixture |
| 55 | AI features and output safeguards | not-needed | not part of this fixture |
| 56 | Geo and maps | not-needed | not part of this fixture |
| 57 | Pricing engine | not-needed | not part of this fixture |
| 58 | Matching and dispatch | not-needed | not part of this fixture |
| 59 | Realtime state | not-needed | not part of this fixture |
| 60 | Roles and verification | not-needed | not part of this fixture |
| 61 | Payouts, splits, and disputes | not-needed | not part of this fixture |
| 62 | Ratings and reviews | not-needed | not part of this fixture |
| 63 | SMS and messaging notifications | not-needed | not part of this fixture |
