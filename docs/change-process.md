# Change Process (Draft v0.1)

How every change to this skeleton, and to apps built from it, is planned and carried out, including work split across sub-agents. The enforcement that backs it is specified in `.kiro/specs/enforcement-setup/`.

## 1. Why this process exists

Steps are shared between strips. A change made for one strip can break another strip that uses the same step. With several agents working at once, two can also edit the same file, and the later save silently overwrites the earlier one.

Kiro does not prevent this on its own (per its docs at the time of writing):

- Sub-agents share the workspace files. Only their conversations are separate.
- Kiro decides which spec tasks run in parallel. There is no documented way to force tasks to run one after another.
- Hooks are not documented to know which sub-agent is acting.

So safety comes from the plan, from git, and from hooks that do not need to know which agent is writing.

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

## Steps

| Step | Action | Affected strips | Reason |
|---|---|---|---|
| db.user.findByEmail | reuse | | |
| db.user.setDisplayName | new | | |
| db.user.findById | modify | profile.view, orders.list | Return deletedAt for soft-deleted users |

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
4. List every existing file in the guarded folders (`src/steps`, `src/strips`, `src/ports`, `src/adapters`, `src/lib`) that any task will edit.

The checks verify the plan against the catalog: a `reuse` that does not match, or a `modify` that leaves out an affected strip, is an error.

**Approval is a commit.** The user reviews the plan, sets `status: active`, and commits it. Only the committed version counts: an uncommitted edit to the plan grants nothing. Only the user changes a plan's status. When the work is finished, the plan is set to `done` and committed.

To change scope during the work, the agent proposes an edit to the plan, and the user reviews and commits it.

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
- Non-sequential tasks only create new files, and no two of them write the same file.

`Writes:` and `Mode:` are this project's notation. Kiro shows them as task details and does not act on them. The checks and the process below give them their meaning.

## 5. Execution

1. **Check the tasks.** Run the conformance check. The task rules must pass before any work starts.
2. **Sequential phase.** The main agent runs the `sequential` tasks one at a time, in order, without sub-agents and without "run all tasks". After each `modify` task, the affected strips' tests must pass before the next task starts.
3. **Parallel phase.** Only after the sequential phase passes, non-sequential tasks may be given to sub-agents, each with its task's file list. Each sub-agent may create only the files in its list.
4. **Final check.** The main agent runs the full check command. The Stop hook does this too and sends the agent back if anything fails.
5. **Review.** The user reviews the result. The plan is set to `done` and committed.

## 6. What enforces this

| Guard | When | What it catches |
|---|---|---|
| Plan rules (R32, R33) | Every check | `reuse` that does not match the catalog, `modify` missing an affected strip |
| Task rules (R34 to R36) | Every check | Missing `Writes:`, two parallel tasks writing the same file, a parallel task editing an existing file |
| Protection hook | Before each agent write | Agent edits to existing guarded files not listed in an active committed plan, and edits to enforcement files |
| Change rule (R37) | Every check | Existing guarded files changed but not in the plan, including changes made through shell commands |
| No-widening (R17) and exceptions | Every check | Any change to a step's input, output, or permissions, which also needs an exception that only the user can unlock |
| Affected strip tests | Every check | A `modify` that breaks a strip using the step |
| Stop hook | When the agent tries to finish | Any of the above still failing |

## 7. Limits

- The hooks guard against accidents. An agent determined to get around them could, for example by committing a plan change through the shell. The checks after the fact (R37, R17) and the commit history are the stronger safety net, and plan commits are listed in the report.
- Two agents creating new files can still disagree in behavior (for example two near-identical new steps). The near-duplicate warning (R08) and review catch some of this.
- How sub-agents interact with the Stop hook, and what task hooks receive, is not documented. Both are tested once the hooks exist, and this document is updated with the results.
- Full isolation is possible by giving each sub-agent its own git worktree, so overlapping edits become visible merge conflicts. It costs a merge step per task, and is not the default.
