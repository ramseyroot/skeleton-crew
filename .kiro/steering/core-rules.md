---
inclusion: always
---

# Core rules (always loaded)

These rules are enforced by `pnpm check` (conformance, typecheck, tests). A Stop hook runs it when you try to finish and sends you back while anything fails. Rule details: `docs/conformance-rules.md`.

1. Never return an error as a value. Steps return `Result` (`{ ok: true, value }` or `{ ok: false, error }`). No `return e.message`, no `String(e)` as output, no thrown strings. (R02)
2. Read `docs/generated/catalog.md` before creating or reusing a step. Reuse only if input, output, and permissions match exactly. Otherwise create a new, narrow step. (R32, R39)
3. Never widen an existing step's input, output, or permissions. (R17)
4. Never edit protected files: `conformance.config.json`, `conformance.exceptions.json`, `scripts/conformance/rules/**`, `scripts/conformance/hooks/**`, `.kiro/hooks/**`, `.kiro/steering/**`. Tell the user what change you want and why. Do not add exceptions to get past a rule.
5. Run `pnpm check` before finishing. Fix every item it lists, not only the first.
6. No `console` outside the logger adapter. (R01)
7. Show every default as a proposal before applying it. Do not turn an assumption into a plan.

## Change process (full text: `docs/change-process.md`)

- Every change starts with a spec: requirements, design, `change-plan.md`, `tasks.md`. Each is reviewed before the next.
- The change plan marks each step `reuse`, `new`, or `modify`, and lists every existing file you will edit. It counts only once the user commits it with `status: active`. (R33, R37)
- Editing an existing file in `src/steps`, `src/strips`, `src/ports`, `src/adapters`, or `src/lib` that the committed plan does not list is blocked.
- Every task has `Writes:`. Tasks that edit existing files are `Mode: sequential` and run one at a time in the main tree. (R34 to R36)
- Parallel tasks only create new files, each in its own worktree: `pnpm worktree create <id>`, then `verify`, `merge` (in task order), `remove`.
- A new step needed by several strips is built once, in its own sequential task first. (R38)

## Progress and resuming

- Before a task writes files: append a `started` row to the spec's `progress.md` (UTC time, from the clock).
- When it finishes: tick it in `tasks.md`, append a `done` row with commit `this`, and commit everything as `task(<spec>/<id>): <title>`. (R40)
- When blocked: append a `blocked` row with the decision needed, and ask the user.
- To resume: read the last rows of `progress.md`, then `git log --oneline -10` and `git status`. Uncommitted changes or a final `started` row mean that task is unfinished.
- Docs carry `created` and `updated` dates; update `updated` when you change a doc. (R41)
