---
inclusion: fileMatch
fileMatchPattern: "src/steps/scrape/**"
---

# Steps: scrape class (fetching external pages, for ingestion inside the app)

Checked by `pnpm check`: R02 (errors as values), R03 (provider imports), R04 (raw SQL), R05 (name and folder), R09 (exports use `defineStep`), R10 (manifest complete), R11 (manifest literals), R17 (no widening).

## Rules

Fetch and parse are separate steps: fetch is `scrape`, parsing is `pure` and tested on saved page snapshots. Record source URL and fetch time. Check the source's terms before collecting.

Typical error kinds: `network`, `rate_limited`, `blocked`, `source_changed`, `parse_failed`.

## Manifest

```ts
export const findUserByEmail = defineStep({
  name: "scrape.<domain>.<verb>",   // literal, unique, matches the folder
  class: "scrape",
  input: InputSchema,
  output: OutputSchema,
  permissions: { reads: [], writes: [], storage: [] }, // literals, exactly what it touches
  errors: [],                     // kinds it can return
  run: async (input, ctx) => { /* uses only ctx.ports it is allowed */ },
});
```

## Before finishing a scrape step

- [ ] Checked the catalog: no existing step matches exactly, or this is a planned `modify`.
- [ ] Name is `scrape.<domain>.<verb>`, file is in `src/steps/scrape/`.
- [ ] Permissions list exactly what it touches. Nothing widened on an existing step.
- [ ] Failures return `Result` errors with a kind; nothing returns error text as a value.
- [ ] Tests: Parsers tested on snapshots; a changed layout must fail a test.
