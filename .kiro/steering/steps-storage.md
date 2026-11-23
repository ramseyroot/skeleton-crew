---
inclusion: fileMatch
fileMatchPattern: "src/steps/storage/**"
---

# Steps: storage class (object storage and browser storage)

Checked by `pnpm check`: R02 (errors as values), R03 (provider imports), R04 (raw SQL), R05 (name and folder), R09 (exports use `defineStep`), R10 (manifest complete), R11 (manifest literals), R17 (no widening).

## Rules

Declare every key prefix in `permissions.storage`; touch nothing outside it. Missing objects return `null`. Browser storage: keys include the user ID, cleared on logout and version change, never read before hydration.

Typical error kinds: `not_found`, `forbidden`, `network`.

## Manifest

```ts
export const findUserByEmail = defineStep({
  name: "storage.<domain>.<verb>",   // literal, unique, matches the folder
  class: "storage",
  input: InputSchema,
  output: OutputSchema,
  permissions: { reads: [], writes: [], storage: [] }, // literals, exactly what it touches
  errors: [],                     // kinds it can return
  run: async (input, ctx) => { /* uses only ctx.ports it is allowed */ },
});
```

## Before finishing a storage step

- [ ] Checked the catalog: no existing step matches exactly, or this is a planned `modify`.
- [ ] Name is `storage.<domain>.<verb>`, file is in `src/steps/storage/`.
- [ ] Permissions list exactly what it touches. Nothing widened on an existing step.
- [ ] Failures return `Result` errors with a kind; nothing returns error text as a value.
- [ ] Tests: Run against the in-memory storage adapter.
