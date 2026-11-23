---
inclusion: fileMatch
fileMatchPattern: "src/steps/db/**"
---

# Steps: db class (reads and writes through repository ports)

Checked by `pnpm check`: R02 (errors as values), R03 (provider imports), R04 (raw SQL), R05 (name and folder), R09 (exports use `defineStep`), R10 (manifest complete), R11 (manifest literals), R17 (no widening).

## Rules

Use repository ports only (`ctx.ports.users.findByEmail`). No SQL, query builders, or drivers here (R03, R04). A read by key returns `null` when missing; a list returns `[]`. Declare every table read and written in `permissions`.

Typical error kinds: `not_found`, `conflict`, `network`, `unexpected`.

## Manifest

```ts
export const findUserByEmail = defineStep({
  name: "db.<domain>.<verb>",   // literal, unique, matches the folder
  class: "db",
  input: InputSchema,
  output: OutputSchema,
  permissions: { reads: [], writes: [], storage: [] }, // literals, exactly what it touches
  errors: [],                     // kinds it can return
  run: async (input, ctx) => { /* uses only ctx.ports it is allowed */ },
});
```

## Before finishing a db step

- [ ] Checked the catalog: no existing step matches exactly, or this is a planned `modify`.
- [ ] Name is `db.<domain>.<verb>`, file is in `src/steps/db/`.
- [ ] Permissions list exactly what it touches. Nothing widened on an existing step.
- [ ] Failures return `Result` errors with a kind; nothing returns error text as a value.
- [ ] Tests: Run against the in-memory adapter.
