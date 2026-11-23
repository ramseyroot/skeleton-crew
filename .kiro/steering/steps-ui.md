---
inclusion: fileMatch
fileMatchPattern: "src/steps/ui/**"
---

# Steps: ui class (event handlers and form logic)

Checked by `pnpm check`: R02 (errors as values), R03 (provider imports), R04 (raw SQL), R05 (name and folder), R09 (exports use `defineStep`), R10 (manifest complete), R11 (manifest literals), R17 (no widening).

## Rules

No data fetching (that belongs in strips). Mostly produces `audience: "user"` errors with a written `userMessage`.

Typical error kinds: `validation`.

## Manifest

```ts
export const findUserByEmail = defineStep({
  name: "ui.<domain>.<verb>",   // literal, unique, matches the folder
  class: "ui",
  input: InputSchema,
  output: OutputSchema,
  permissions: { reads: [], writes: [], storage: [] }, // literals, exactly what it touches
  errors: [],                     // kinds it can return
  run: async (input, ctx) => { /* uses only ctx.ports it is allowed */ },
});
```

## Before finishing a ui step

- [ ] Checked the catalog: no existing step matches exactly, or this is a planned `modify`.
- [ ] Name is `ui.<domain>.<verb>`, file is in `src/steps/ui/`.
- [ ] Permissions list exactly what it touches. Nothing widened on an existing step.
- [ ] Failures return `Result` errors with a kind; nothing returns error text as a value.
- [ ] Tests: Unit tests, plus a Storybook story per end state of the strip it uses.
