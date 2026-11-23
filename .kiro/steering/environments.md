---
inclusion: fileMatch
fileMatchPattern: ["src/config/**", "scripts/db/**", ".env*"]
---

# Environments and data separation

Checked by `pnpm check`: R23 (profiles valid), R24 (local is offline), R25 (adapters exist), R26 (no production secrets outside production), R27 (destructive scripts guarded). Full rules: `docs/environments.md`.

- Profiles: `local` (offline, seeded, resettable), `dev`, optional `staging`, `prod`. One variable (`APP_ENV`) picks the profile.
- `src/config/profiles.ts` exports `profiles` (each with `env`, `adapters`, `allowedHosts`) and `profileSchema` with `safeParse()`.
- `local` allows only `localhost`, `127.0.0.1`, `::1`, and every port has an offline adapter.
- Each environment has its own database, buckets, queues, and credentials. Nothing is shared.
- Production secrets never appear with a value outside production env files.
- Seed, reset, and migrate-down scripts call `assertNotProd()` first.
- Cache keys and log entries include the environment name.
- Dev data never moves to production. Production data copied down is anonymized first.
