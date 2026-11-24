---
created: 2026-11-23
updated: 2026-11-24
---

# Progress: platform-parts

Append-only. Format and resume procedure: `docs/change-process.md`, section 7.

| When (UTC) | Task | State | Commit | Files | Next |
|---|---|---|---|---|---|
| 2026-11-23 23:55 | plan | done | this | requirements.md, design.md, change-plan.md, tasks.md | User reviews design G1 to G10, the plan and the tasks. Then the agent activates the plan and starts task 1 |
| 2026-11-24 00:02 | plan | checkpoint | | design.md, change-plan.md, requirements.md | The user confirmed the design (G1 to G10) and asked to proceed. Plan activated by the agent under the delegation. Requirement 4.1 reworded for G10 |
| 2026-11-24 00:02 | 1 | started | | | Principal, authorization helpers, the API pipeline and the sensitive flag. The pipeline takes the rate limit check as a dependency (a function), so it does not need Ports.limiter, which task 5 adds |
| 2026-11-24 00:08 | 1 | done | this | src/lib/principal.ts, src/lib/authz.ts, src/lib/authz.test.ts, src/lib/http.ts, tests/lib/http.test.ts, src/lib/step.ts, src/lib/strip.ts, tests/lib/step.test.ts, tests/lib/strip.test.ts (pnpm check passes with both profile strip tests as affected tests; 60+ new tests) | Tasks 2 and 3 next, in parallel worktrees. Notes: (1) the pipeline takes the limiter as a function dependency, so it does not depend on Ports.limiter (task 5); (2) the sensitive flag applies to a strip that contains a sensitive step, by default; (3) a date rollover at midnight UTC made R41 fail on four spec files, so their updated date moved to 2026-11-24 (every doc touched after midnight needs the new date) |
| 2026-11-24 00:09 | 2 | started | | | RateLimiter port: worktree .worktrees/task-2, branch task/2, sub-agent |
| 2026-11-24 00:09 | 3 | started | | | Auth port: worktree .worktrees/task-3, branch task/3, sub-agent |
