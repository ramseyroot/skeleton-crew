---
inclusion: fileMatch
fileMatchPattern: ["src/features/**/steps/cache/**", "src/shared/steps/cache/**"]
---

# Steps: cache class (cache and in-memory reads and writes)

Checked by `pnpm check`: R02 (errors as values), R03 (provider imports), R04 (raw SQL), R05 (name and folder), R09 (exports use `defineStep`), R10 (manifest complete), R11 (manifest literals), R17 (no widening).

## Rules

A miss is a normal value `{ hit: false }`, never an error. Entries are versioned envelopes; a corrupt or outdated entry is a miss and is deleted. The app must work with the cache off. Never keep counters, balances, or order state in an eventually consistent cache.

Typical error kinds: `validation` (corrupt entry, treated as a miss).

## Manifest

```ts
export const findUserByEmail = defineStep({
  name: "cache.<domain>.<verb>",   // literal, unique, matches the folder
  class: "cache",
  input: InputSchema,
  output: OutputSchema,
  permissions: { reads: [], writes: [], storage: [] }, // literals, exactly what it touches
  errors: [],                     // kinds it can return
  run: async (input, ctx) => { /* uses only ctx.ports it is allowed */ },
});
```

## Before finishing a cache step

- [ ] Checked the catalog: no existing step matches exactly, or this is a planned `modify`.
- [ ] Name is `cache.<domain>.<verb>`, file is in `src/features/<feature>/steps/cache/` (or `src/shared/steps/cache/` if more than one feature uses it).
- [ ] Permissions list exactly what it touches. Nothing widened on an existing step.
- [ ] Failures return `Result` errors with a kind; nothing returns error text as a value.
- [ ] Tests: Run with the memory cache and with `NullCache`.
