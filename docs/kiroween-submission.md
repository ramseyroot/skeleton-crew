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
| Kiro use | Specs (requirements, design, change plan, tasks), steering loaded by file pattern, a Stop hook that sends the agent back until checks pass, a PreToolUse hook that blocks unplanned edits, worktrees per parallel sub-agent | Built and in use: specs, checker (41 rules), check command (runs all tests), worktree command (two sub-agents built two ports in parallel worktrees), hooks on, steering written. Live tested, including blocked edits and a sub-agent |
| AI development strategy | Requirements are enforced by checks, not remembered. Every default is shown before it is applied. Change plans with impact lists, approval by commit, shared code changed one task at a time, parallel agents limited to new files. A progress log lets any agent resume | Designed and documented. Partly enforced |
| Design (polish) | A working template: core library, ports with two adapters each, one example strip end to end, Storybook stories, offline local mode, two apps started from the template | Skeleton core built: eight ports with adapters and contract suites, one example feature on both databases with the cache on and off, Storybook stories, a Next.js page that runs offline. Apps not started |
| Innovation | The enforcement layer itself: an agent's own guardrails that read the project's manifests, catalog, plans, and git history, and stop it from finishing or editing out of plan | Built. The agent also reported its own rough edges (test fixtures flagged by the checker, parallel tasks tripping the progress rule) instead of hiding them |
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
- Devpost rules check. The 2026 rules page (`kiroween.devpost.com/rules`) could not be fetched (HTTP 403). What follows comes from a secondary source about the 2025 edition ([Decoding Kiroween](https://dev.to/brian_mk/decoding-kiroween-4nm), updated 2025-11-23) and a forum snippet saying demo videos must be under 3 minutes. **Unverified for 2026. The builder should read the official page.**
  - Skeleton Crew: a code template shown with **two distinct applications** built from it. So both apps are likely required, and cutting one app slice is a real risk, not a free cut.
  - Demo video under 3 minutes that shows the project working.
  - Public repository with an OSI-approved open source license clearly visible. **This repository has no LICENSE file and no remote yet.**
  - The `.kiro` directory at the repository root and not in `.gitignore`. It is tracked here (22 files) and not ignored.
  - A written explanation of how Kiro was used (specs, hooks, steering, MCP, vibe coding). The write-up draft in `kiroween-script.md` covers specs, hooks and steering.
  - Judging in that source: three equal criteria (potential value, implementation with Kiro, quality and design). The criteria table above lists five, from kiro.dev, and may be the 2026 wording.
