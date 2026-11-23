---
inclusion: fileMatch
fileMatchPattern: "src/steps/api/**"
---

# Steps: api class (outbound HTTP calls)

Checked by `pnpm check`: R02 (errors as values), R03 (provider imports), R04 (raw SQL), R05 (name and folder), R09 (exports use `defineStep`), R10 (manifest complete), R11 (manifest literals), R17 (no widening).

## Rules

Always set a timeout. Parse every response with a schema before use. Map HTTP status to an error kind (401/403 `unauthorized`, 429 `rate_limited`, 5xx `upstream`, timeouts `network`). Retry only when `retryable`.

Typical error kinds: `network`, `upstream`, `unauthorized`, `rate_limited`, `validation`.

## Manifest

```ts
export const findUserByEmail = defineStep({
  name: "api.<domain>.<verb>",   // literal, unique, matches the folder
  class: "api",
  input: InputSchema,
  output: OutputSchema,
  permissions: { reads: [], writes: [], storage: [] }, // literals, exactly what it touches
  errors: [],                     // kinds it can return
  run: async (input, ctx) => { /* uses only ctx.ports it is allowed */ },
});
```

## Before finishing a api step

- [ ] Checked the catalog: no existing step matches exactly, or this is a planned `modify`.
- [ ] Name is `api.<domain>.<verb>`, file is in `src/steps/api/`.
- [ ] Permissions list exactly what it touches. Nothing widened on an existing step.
- [ ] Failures return `Result` errors with a kind; nothing returns error text as a value.
- [ ] Tests: Recorded responses for each status, run offline.
