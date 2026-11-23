---
inclusion: fileMatch
fileMatchPattern: "src/features/**/strips/**"
---

# Strips

Checked by `pnpm check`: R06 (name), R07 (unique), R12 (routing complete), R13 (budget), R14 (invalidates), R15 (unknown routing keys), R16 (catalog current), R32, R33, R38, R39 (change plan).

## Template

```ts
export const saveProfile = defineStrip({
  name: "profile.save",                       // <domain>.<verb>
  budget: { reads: ["users"], writes: ["users"], storage: [] },
  steps: [parseProfileForm, updateDisplayName], // import each step from its own file
  invalidates: ["profile:{userId}"],          // required when any step writes; [] if none
  routing: {
    "pure.profile.parseForm": { validation: "toast" },
    "db.user.setDisplayName": { conflict: "toast", network: "retry:2" },
    "*": "abort",
  },
});
```

Routing actions: `toast` (only `audience: "user"` errors reach the user), `retry:n`, `abort`, `log-and-continue`, `recover:<step>`.

## Reuse

- Reuse a step only if input, output, and permissions match exactly and fit the budget. Otherwise create a new narrow step.
- Never widen an existing step. A real need to change one is a `modify` in the change plan, listing every strip that uses it.
- Steps report facts (error kinds). The strip decides what the user sees.
- After adding or changing steps or strips: `pnpm conformance --write-catalog` and commit the catalog.

## Current catalog

#[[file:docs/generated/catalog.md]]
