---
created: 2026-11-23
updated: 2026-11-23
---

# Kiroween Submission: Criteria and Evidence

The submission must show both what was built and how it was built with Kiro. This file maps each judging criterion to what demonstrates it, and lists what is still missing. Category: Skeleton Crew. Deadline: December 4, 2:00 PM PT (per kiro.dev/events; confirm on Devpost).

## Criteria as given

1. **Potential impact:** does it solve a real problem for a real audience?
2. **Technological implementation:** how well does it use Kiro? Is there a thoughtful AI development strategy?
3. **Design:** is it a complete, polished product, not just a proof of concept?
4. **Innovation:** is the idea creative and new?
5. **Presentation:** does the video show the project working end to end, with a clear pitch?

## What answers each criterion

| Criterion | What shows it | Status |
|---|---|---|
| Impact | The problem, in the builder's words: agents skip requirements after a few functions, errors pass as output, steps get shaped to one provider, parallel agents overwrite shared code, dev and prod data mix. The audience: developers building paid APIs and apps with AI agents. `docs/README.md` section 6 maps each problem to its fix | Written |
| Kiro use | Specs (requirements, design, change plan, tasks), steering loaded by file pattern, a Stop hook that sends the agent back until checks pass, a PreToolUse hook that blocks unplanned edits, worktrees per parallel sub-agent | Specs written. Checker (41 rules), check command, worktree command, and both hook scripts built and tested. Steering not written, hooks not switched on |
| AI development strategy | Requirements are enforced by checks, not remembered. Every default is shown before it is applied. Change plans with impact lists, approval by commit, shared code changed one task at a time, parallel agents limited to new files. A progress log lets any agent resume | Designed and documented. Partly enforced |
| Design (polish) | A working template: core library, ports with two adapters each, one example strip end to end, Storybook stories, offline local mode, two apps started from the template | Not started beyond the enforcement tooling |
| Innovation | The enforcement layer itself: an agent's own guardrails that read the project's manifests, catalog, plans, and git history, and stop it from finishing or editing out of plan | Being built |
| Presentation | A video that shows: the problem, a requirement being skipped and caught, the agent sent back by the Stop hook, a blocked unplanned edit, the catalog, and two apps from one template | Not started |

## Evidence of how it was built

These already exist and can be shown in the video and write-up:

- **Git history:** one commit per task (`task(enforcement-setup/<id>): ...`), plus the design commits before them.
- **`progress.md`:** dated record of every task start, finish, block, checkpoint, and plan deviation, including the decision to use TypeScript 6 for the compiler API after finding TypeScript 7 lacks it.
- **Specs:** `.kiro/specs/enforcement-setup/` shows requirements growing from conversation (change plans, worktrees, progress logs were added after the builder raised each concern).
- **Design docs:** `docs/` records decisions with their reasons and status.

Keep these honest: deviations and mistakes stay in the record. They show the process working.

## Script

The write-up and video script are drafted in `kiroween-script.md` and updated at every checkpoint, with a build log of moments worth showing.

## Still to plan

- Scope that fits the deadline: which parts of the skeleton and which app slices are needed for an end-to-end demo.
- Devpost rules check: required repository visibility, license, video length, and whether two apps are required.
