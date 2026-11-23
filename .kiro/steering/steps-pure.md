---
inclusion: fileMatch
fileMatchPattern: "src/steps/pure/**"
---

# Steps: pure class (regex, parsing, formatting, mapping, pricing math)

Checked by `pnpm check`: R02 (errors as values), R03 (provider imports), R04 (raw SQL), R05 (name and folder), R09 (exports use `defineStep`), R10 (manifest complete), R11 (manifest literals), R17 (no widening).

## Rules

No I/O and no logging inside (the wrapper logs). No match or empty input is a normal typed value (`null`, `{ matched: false }`), not an error, unless the strip needs a match.

Typical error kinds: `validation`.

## Manifest

```ts
export const findUserByEmail = defineStep({
  name: "pure.<domain>.<verb>",   // literal, unique, matches the folder
  class: "pure",
  input: InputSchema,
  output: OutputSchema,
  permissions: { reads: [], writes: [], storage: [] }, // literals, exactly what it touches
  errors: [],                     // kinds it can return
  run: async (input, ctx) => { /* uses only ctx.ports it is allowed */ },
});
```

## Before finishing a pure step

- [ ] Checked the catalog: no existing step matches exactly, or this is a planned `modify`.
- [ ] Name is `pure.<domain>.<verb>`, file is in `src/steps/pure/`.
- [ ] Permissions list exactly what it touches. Nothing widened on an existing step.
- [ ] Failures return `Result` errors with a kind; nothing returns error text as a value.
- [ ] Tests: Table-driven unit tests: input, expected output, one row per case.
