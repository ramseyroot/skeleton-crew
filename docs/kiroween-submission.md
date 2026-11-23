---
created: 2026-11-23
updated: 2026-11-23
---

# Kiroween Submission: Criteria and Evidence

The submission must show both what was built and how it was built with Kiro. This file maps each judging criterion to what demonstrates it, and lists what is still missing. Category: Skeleton Crew. Deadline: December 4, 2026, 2:00 PM PT (confirmed in the official rules).

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
- Decide the open points under "Official rules" below. Two of them change the plan.

## Official rules (Kiroween 2026, read on 2026-11-23 from the page the builder pasted)

Dates: submission period ends **December 4, 2026, 2:00 pm Pacific**. No extensions, no late entries. Judging December 16 to January 29, winners around February 3. Teams of up to 3.

What the Skeleton Crew submission must contain:

| Rule | Status here |
|---|---|
| A working application built with Kiro (IDE, CLI, Web or Crew). Insufficient use of Kiro is disqualifying | Built with Kiro CLI |
| Skeleton Crew: a lean template **and two distinct applications from it** | Template built, apps not started |
| **The repo must contain 2 separate repo folders for the 2 applications** | **Conflicts with the current plan** (see decision 1) |
| Public GitHub repo (not GitLab or Bitbucket), with all source, assets and run instructions | No remote yet |
| An open source license file, detectable at the top of the repo page (About section) | **No LICENSE file yet** |
| `/.kiro` at the repo root, and never in `.gitignore` | Tracked, 22+ files, not ignored |
| New projects only: created after Oct 30, 2026. Disclose pre-existing code. Frameworks, libraries and starter templates are allowed | First commit was 2026-11-23. Disclose the libraries |
| A URL to the functional application(s), with credentials if needed | **Open** (see decision 2) |
| Text description of features and functionality | Draft in `kiroween-script.md` |
| Demo video: **under 3 minutes**, public on **YouTube**, footage of the project running on its device, no copyrighted music or third-party trademarks | Script drafted, not recorded |
| A write-up of how Kiro was used (list below) | Partly drafted |
| Say which category and bonus categories you enter | Skeleton Crew |

The write-up must show "next-level understanding" of Kiro. The rules ask about each of these:

| Kiro feature asked about | What we have | Gap |
|---|---|---|
| IDE, CLI, Web, Crew: how they differed, if several were tried | Kiro CLI only | Say so, or try another |
| Custom agents | Built-in sub-agents (general-task-execution) ran two tasks in parallel worktrees | No custom agent created |
| Agent hooks | Stop hook, protection hook, prompt-submit reset, all live-tested | None |
| Spec-driven development vs vibe coding | Two full specs (requirements, design, change plan, tasks, progress) | Write the comparison |
| Steering docs | Always-loaded core rules plus files loaded by folder | Say which strategy mattered most |
| MCP | Not used | Optional: only if it genuinely helps |
| Property-based testing | Not used. All tests are example-based | Optional: add a few property tests where they fit (cache envelope round trip, pagination cursors, routing) |
| Kiro powers | Not used | Optional |

Judging, two stages. Stage one is pass or fail: fits the theme and reasonably applies Kiro. Stage two scores five equal criteria, 20% each: Potential Impact, Technological Implementation, Design, Innovation/Idea, Presentation. This matches the criteria table above.

Prizes that matter: Best Skeleton Crew ($5,000), the overall prizes, and these bonus prizes that cost little: **Bonus Blog Prize** (a public blog post about Kiro and the build, on a third-party platform, published during the submission period, saying it was written for Kiroween 2026; 2,000 Kiro credits for the top 100), **Social Blitz** (a post that starts with `#KiroweenHackathon26`, with your favorite thing about Kiro and how it changed your development; link in the form), and **Best Demo**.

Credits: each eligible individual can request 4,000 Kiro credits through the Credit Request Form by **December 1, 2026, 12:00 pm Pacific**, and must redeem them by December 4.

### Decisions needed from the builder

1. **Repo layout.** The rules require one public repo with two app folders. The plan said each app is its own repo with no monorepo. Options, none chosen yet:
   - A. One submission repo: the skeleton at the root, and the apps in `apps/zidolia` and `apps/minicargo`. Simple, matches the rule literally. Gives up "an app is its own repo".
   - B. Keep three repos for development, and make the submission repo a copy (git subtree or a sync script) with the apps in folders. Keeps the independence, adds work.
   - C. Git submodules for the apps. The folders would hold only pointers, so judges may see empty folders. Not recommended.
2. **A URL to the functional application.** The apps run offline on your PC. The rules ask for a URL to the application, though judges "are not required to test". Options: a hosted demo of each app (needs a host that can run a Node server with a persistent file, not the Cloudflare plan yet), or the public repo plus run instructions plus the video as the "test build". The repo-plus-video route is cheaper and probably acceptable, but the rules lean toward a link.
3. **License.** MIT, Apache-2.0, or another OSI-approved license.
4. **Property tests, MCP, a custom agent, or another Kiro surface.** Each would add to the "variety of Kiro tools" the judges look for. None is required.
