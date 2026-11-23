---
created: 2026-11-23
updated: 2026-11-23
---

# Change Process (Draft v0.2)

How every change to this skeleton, and to apps built from it, is planned and carried out, including work split across sub-agents. The enforcement that backs it is specified in `.kiro/specs/enforcement-setup/`.

## 1. Why this process exists

Steps are shared between strips. A change made for one strip can break another strip that uses the same step. With several agents working at once, two can also edit the same file, and the later save silently overwrites the earlier one.

Kiro does not prevent this on its own (per its docs at the time of writing):

- Sub-agents share the workspace files. Only their conversations are separate.
- Kiro decides which spec tasks run in parallel. There is no documented way to force tasks to run one after another.
- Hooks are not documented to know which sub-agent is acting.

So safety comes from the plan, from git, from one git worktree per parallel task, and from hooks that identify the task by its folder rather than by the agent.

## 2. The stages

Every feature or change is a spec in `.kiro/specs/<name>/`, done in this order. Each file is reviewed by the user before the next is written.

1. `requirements.md`: what must be true.
2. `design.md`: how it will work.
3. `change-plan.md`: which steps are reused, created, or modified, which existing files are edited, and who else is affected (section 3).
4. `tasks.md`: the work, split into tasks with declared files (section 4).
5. Execution (section 5).

A spec that only creates new files still has a change plan, listing only `new` entries. It is short, and it proves that nothing existing is touched.

## 3. The change plan

Format:

```markdown
---
status: draft        # draft, then active once approved, then done
---

## Strips in this spec

- profile.save
- profile.view

## Steps

| Step | Action | Used by (this spec) | Affected strips | Reason | Distinct from |
|---|---|---|---|---|---|
| db.user.findByEmail | reuse | profile.save | | | |
| db.user.setDisplayName | new | profile.save | | | |
| db.user.findById | modify | profile.view | profile.view, orders.list | Return deletedAt for soft-deleted users | |

## Existing files to edit

| File | Task | Reason |
|---|---|---|
| src/steps/db/user.findById.ts | 2 | modify entry above |

## Affected strip tests

- src/strips/profile.view.strip.test.ts
- src/strips/orders.list.strip.test.ts
```

How to fill it in:

1. Read `docs/generated/catalog.md` first.
2. For each step the work needs:
   - **reuse** only if input, output, and permissions match exactly and fit the strip's budget.
   - **new** when nothing matches exactly. This is the default.
   - **modify** only when a new step would duplicate logic that must stay single (for example a shared rule). Give the reason.
3. For each **modify**, copy the "used by" strips from the catalog into "Affected strips", and list their test files.
4. **Compare the strips in the spec with each other.** List every strip, and for each step which of these strips use it. A `new` step used by more than one strip is created once, in its own sequential task before those strips' tasks, and the strips then use it as existing. A `new` step whose name is a near-duplicate of another planned or existing step needs a `Distinct from` note saying why both should exist. Steps that seem to do the same job under unrelated names are pointed out in the plan for the user to decide.
5. List every existing file in the guarded folders (`src/steps`, `src/strips`, `src/ports`, `src/adapters`, `src/lib`) that any task will edit.

The checks verify the plan against the catalog and against itself: a `reuse` that does not match, a `modify` that leaves out an affected strip, a shared new step built more than once or not first, and an unexplained near-duplicate are all errors.

**Approval is a commit.** The user reviews the plan, sets `status: active`, and commits it. Only the committed version counts: an uncommitted edit to the plan grants nothing. The user decides when a plan is approved. **Since 2026-11-23 the user has delegated the status change to the agent**: after the user has reviewed a plan and said to proceed, the agent sets `status: active` and commits only that file, in its own commit (`plan(<spec>): activate`), before any task starts. When the work is finished, the agent sets `done` and commits it the same way. The agent never activates a plan the user has not reviewed, and a scope change still needs the user's review before the plan is edited. The protected steering text (`core-rules.md`) still says the user commits the plan, and is left as it is until the user unlocks it.

To change scope during the work, the agent proposes an edit to the plan, and the user reviews it. The agent then commits it.

## 4. Tasks

Each task in `tasks.md` declares the files it writes, and whether it must run on its own:

```markdown
- [ ] 2. Modify db.user.findById to return deletedAt
  - Mode: sequential
  - Writes: src/steps/db/user.findById.ts, src/steps/db/user.findById.test.ts
- [ ] 3. Update profile.view strip to show deleted users
  - Mode: sequential
  - Writes: src/strips/profile.view.strip.ts
- [ ] 4. Add db.user.setDisplayName step
  - Writes: src/steps/db/user.setDisplayName.ts, src/steps/db/user.setDisplayName.test.ts
- [ ] 5. Add profile.save strip and stories
  - Writes: src/strips/profile.save.strip.ts, src/strips/profile.save.strip.test.ts, src/components/ProfileForm/ProfileForm.stories.tsx
```

Rules:

- Every task has a `Writes:` line.
- A task that edits any existing file is `sequential`.
- Each `modify` step gets its own task, placed before the tasks that depend on it.
- Each `new` step shared by several strips in the spec gets its own sequential task, placed before those strips' tasks.
- Non-sequential tasks only create new files, and no two of them write the same file.

`Writes:` and `Mode:` are this project's notation. Kiro shows them as task details and does not act on them. The checks and the process below give them their meaning.

## 5. Execution

1. **Check the tasks.** Run the conformance check. The task rules must pass before any work starts.
2. **Sequential phase.** The main agent runs the `sequential` tasks one at a time, in order, without sub-agents and without "run all tasks". After each `modify` task, the affected strips' tests must pass before the next task starts.
3. **Parallel phase.** Only after the sequential phase passes and is committed. For each non-sequential task, up to the worktree limit (2 by default):
   1. `node scripts/conformance/worktree.ts create <id>` makes `.worktrees/task-<id>/` on branch `task/<id>` and installs dependencies with pnpm.
   2. A sub-agent works only inside that folder, with its task's file list. The hook blocks writes outside the list, and blocks writes to the main tree's guarded folders while any task worktree is open.
   3. The sub-agent commits on its branch.
   4. `worktree.ts verify <id>`: the branch changed only the listed files, and the check command passes inside the worktree.
   5. `worktree.ts merge <id>`, in task order. A conflict or a failed check after merging stops the process, leaves the main branch as it was, and comes to the user.
   6. `worktree.ts remove <id>` deletes the folder and the branch.
4. **Final check.** The main agent runs the full check command. The Stop hook does this too and sends the agent back if anything fails.
5. **Review.** The user reviews the result. The plan is set to `done` and committed.

## 6. What enforces this

| Guard | When | What it catches |
|---|---|---|
| Plan rules (R32, R33) | Every check | `reuse` that does not match the catalog, `modify` missing an affected strip |
| Task rules (R34 to R36) | Every check | Missing `Writes:`, two parallel tasks writing the same file, a parallel task editing an existing file |
| Plan comparison rules (R38, R39) | Every check | A shared new step built more than once or not first, an unexplained near-duplicate |
| Protection hook | Before each agent write | Agent edits to existing guarded files not listed in an active committed plan, edits to enforcement files, writes in a worktree outside its task's list, and main-tree writes during the parallel phase |
| Worktree verify and merge | Before each merge | A branch that changed files outside its task's list, a failing check in the worktree or after the merge, merge conflicts |
| Change rule (R37) | Every check | Existing guarded files changed but not in the plan, including changes made through shell commands |
| No-widening (R17) and exceptions | Every check | Any change to a step's input, output, or permissions, which also needs an exception that only the user can unlock |
| Affected strip tests | Every check | A `modify` that breaks a strip using the step |
| Stop hook | When the agent tries to finish | Any of the above still failing |

## 7. Progress and resuming

Each spec keeps `progress.md`, an append-only table: date and time (UTC), task, state (`started`, `done`, `blocked`, `checkpoint`), commit, files written, and next step.

- Before a task writes any file, append a `started` row.
- When it finishes, tick its checkbox in `tasks.md`, append a `done` row, and commit everything in one commit named `task(<spec>/<id>): <title>`. The `done` row's commit cell says `this`, meaning the commit that added the row.
- When it cannot continue, append a `blocked` row with the reason and the decision needed.
- Every document in `docs/` and in spec folders has `created` and `updated` dates in its front matter.

To resume unfinished work:

1. Read the last rows of the active spec's `progress.md`.
2. Run `git log --oneline -10` and `git status`.
3. Last row `done`: continue with its next step.
4. Last row `started`, or uncommitted changes: that task is unfinished. Compare the changed files with its `Writes:` list and finish it.
5. Last row `blocked`: report the decision needed and wait for the user.

Rules R40 (progress consistent with tasks and git) and R41 (documents dated) check this.

## 8. Live test results

Recorded in a Kiro CLI 3.5.0 session on 2026-11-23 (task 22 of the enforcement spec).

| Behavior | Result |
|---|---|
| Protection hook on a write-tool call to a protected file (`.kiro/hooks/probe.txt`) | Blocked. The agent received the hook's message and the file was not written |
| Protection hook on a shell command writing a protected file (`cp conformance.config.json conformance.config.json`) | Blocked before the command ran |
| Stop hook with a violation (`console.log` in a temporary `src/live-test.ts`) | The agent was sent back with "attempt 1 of 3" and the R01 violation. This confirms the `reason` field name |
| Stop hook after the fix | Passed; the agent could finish |
| Hooks load in the session where the hook file is created | Yes, without restarting |
| Sub-agent writing its task's file inside its worktree | Allowed |
| Sub-agent writing a file in its worktree that is not in the task's `Writes:` | Blocked with the task's file list in the message. So hooks apply to sub-agents' tool calls |
| Sub-agent writing a new file in a guarded folder of the main tree while a worktree is open | Blocked ("the main tree is not edited during the parallel phase") |
| Sub-agent's default directory | The main tree root, not the worktree. Sub-agents are not confined to a folder; the prompt must give the worktree path, and the hook enforces it |
| Sub-agent committing on its task branch, then `worktree verify` | Commit made; verify passed (file inside the list, check passing in the worktree) |
| Does a sub-agent finishing trigger the Stop hook? | No, in this test: the Stop state file did not change although the main tree had changed. Sub-agent work is therefore checked by `worktree verify` and by the main agent's own Stop, not by a Stop hook of its own |
| Pre and Post Task Execution hook fields | Not tested: these fire only when spec tasks run through Kiro's spec runner, and this project does not use them |

Known cosmetic issue: the Stop hook's reason repeats the "Full report" line. The fix is in `scripts/conformance/hooks/stop.ts`, a protected file, so it waits for the user's unlock.

## 9. Limits

- The hooks guard against accidents. An agent determined to get around them could, for example by committing a plan change through the shell. The checks after the fact (R37, R17) and the commit history are the stronger safety net, and plan commits are listed in the report.
- Duplicate steps with unrelated names (for example `pricing.quote` and `fare.estimate` doing the same job) are not caught mechanically. The plan comparison points out suspected cases, and the user decides.
- How sub-agents interact with the Stop hook, and what task hooks receive, is not documented. Both are tested once the hooks exist, and this document is updated with the results.
- Whether a sub-agent can be confined to its worktree folder is not documented. It is tested before the parallel phase is used for real work. If it cannot, writes outside the worktree are still blocked by the hook and caught by R37.
- Each worktree has its own `node_modules`. pnpm links them from one store, but on a low-spec PC the worktree limit stays small.
