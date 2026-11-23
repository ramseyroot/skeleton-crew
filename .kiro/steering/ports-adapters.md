---
inclusion: fileMatch
fileMatchPattern: ["src/ports/**", "src/adapters/**"]
---

# Ports and adapters

Checked by `pnpm check`: R03 (provider imports only in adapters), R18 (two adapters per port), R19 (contract suite), R20 (adapters run it), R21 (error map), R22 (ports use domain types). Full rules: `docs/provider-ports.md`.

## Ports (`src/ports/<port>.ts`)

- Domain types only. No rows, driver objects, SDK types, or provider IDs.
- Named intent methods (`findByEmail`), no raw query method.
- Separate read and write ports where permissions matter (`UserReader`, `UserWriter`).
- Write down the semantics: ID and timestamp format, not-found behavior, cursor pagination, normalization, how atomic multi-writes are expressed.

## Adapters (`src/adapters/<port>/<provider>/`)

- The only place provider SDKs, drivers, and SQL may be imported.
- Every port has a real adapter and an in-memory adapter.
- `errors.ts` maps provider failures to `ErrorKind`, and the contract suite tests the mapping.
- A test in the adapter folder imports `../contract.test.ts` and runs it with this adapter.
- A provider gap is a documented capability flag, not a silent difference.

## Checklist for a new adapter

- [ ] `errors.ts` mapping table.
- [ ] Test that runs `../contract.test.ts`.
- [ ] Passes the contract suite, including error mapping and idempotency cases.
- [ ] Registered in the profiles that use it (R25).
