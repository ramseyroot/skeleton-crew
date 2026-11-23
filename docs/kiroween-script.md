---
created: 2026-11-23
updated: 2026-11-23
---

# Kiroween: Write-up and Video Script

What you will write on Devpost and say in the video. This is a living draft: the scenes are a starting outline, and the text is rewritten as the project is built, so expect scenes to be added, cut, and reworded. It is updated at every checkpoint. Lines marked **[not built yet]** describe things that do not exist yet: do not record or claim them until they do. The final version is written once the apps are done.

Criteria and evidence map: `kiroween-submission.md`. Check the Devpost rules for the video length limit; the script below is sized for about 3 minutes.

## 1. One-line pitch

Skeleton Crew is an app template that keeps AI agents honest: the rules you write are checked by the project itself, and the agent cannot finish, or edit code its plan did not cover, until they pass.

## 2. Devpost write-up (draft, in your voice)

### Inspiration

I build paid and freemium APIs with websites, and sometimes mobile apps, mostly with AI agents. The same problems kept coming back. I would write requirements, and the agent applied them to a few functions and skipped the rest. Errors came back as strings and flowed into the next function as if they were real output. Functions got shaped around one database, so switching providers meant rewriting them. Caches and local storage corrupted data when I switched them off or changed providers. When several agents worked at once, one would reuse a step with the wrong inputs or a bigger permission scope, or edit a step another feature depended on. And development data mixed with production data.

Writing better instructions did not fix this, because instructions are something the agent has to remember. I wanted rules the project enforces.

### What it does

Skeleton Crew is a template for building apps as "strips": a feature is a chain of small steps, and every step returns a Result, so a failure can never be mistaken for a value. Each step declares what it takes, what it returns, and what it is allowed to touch. Each strip declares a permission budget. Databases, caches, storage, and payments sit behind ports with swappable adapters.

On top of that is an enforcement layer built on Kiro:

- A conformance checker with 41 rules reads the project's code, manifests, catalog, change plans, task lists, and git history, and lists every violation, not just the first.
- A Stop hook runs the checks when the agent tries to finish and sends it back with the list while anything fails. After three attempts it tells the agent to stop and ask me, so it never loops forever.
- A protection hook blocks the agent from editing the rules that judge it, and from editing existing shared code that the approved change plan does not list.
- Change plans list which steps are reused, created, or modified, and who else depends on them, before any code is written. A plan counts as approved only once I commit it.
- Parallel sub-agents each work in their own git worktree. Their changes are checked against their task's file list before they are merged, in order.
- Every spec keeps a dated progress log, so any agent asked to continue unfinished work knows exactly where it stopped.

### How I built it with Kiro

- I started by talking through the problems with Kiro and writing the design down as documents, not code: the function and strip model, provider ports, environments, a 63-item checklist of app parts, and the change process.
- Each concern I raised became a requirement in a Kiro spec. The enforcement spec grew from 15 requirements to 27 during the conversation, as I raised parallel agents, worktrees, and resuming unfinished work.
- Kiro proposed defaults; I confirmed or changed each one before it was used. Plans record which.
- Kiro executed the spec one task per commit, logging every start, finish, block, and plan deviation in `progress.md`. When something did not match the plan, it stopped and asked. One example: the latest TypeScript (7) no longer ships the compiler API the checker needed, so Kiro blocked the task and laid out three options, and I chose one.
- The rules are tested against a broken and a clean example each: 138 tests, all offline.
- **[not built yet]** Steering files that load each kind of function's rules only when the agent works on that folder, and the hooks switched on.

### Challenges

- Making checks strict without making the dev cycle slow: the full check runs in about 1.2 seconds on my low-spec PC, the protection hook in a few hundred milliseconds, and the Stop hook skips entirely when nothing changed.
- Parallel agents share one working folder, and Kiro decides which tasks run in parallel. The answer was to not rely on that: plans, git, and one worktree per task.
- Keeping the agent from rewriting its own rules: protected files, unlocked only by me from my own terminal, for 30 minutes.

### Accomplishments

- **[fill in at the end]** Two different apps built from one template.
- The project is the record of its own process: one commit per task, a dated progress log including mistakes, and specs that show how requirements grew.

### What I learned

- An instruction the agent must remember is weaker than a check that lists what it missed.
- Showing every default before applying it is what plans are for.

### What's next

**[fill in at the end]**

## 3. Video script (about 3 minutes)

Each scene: what is on screen, and what you say. Times are targets.

### Scene 1: The problem (0:00 to 0:25)

- **On screen:** a short code example: a function returning `error.message`, and the next function using it as a name.
- **Say:** "When I build with AI agents, I write requirements, and the agent follows them for a few functions and then forgets. Errors come back as strings and look like real data. Steps get shaped around one database. Parallel agents edit code another feature depends on. Better instructions didn't fix it, because instructions are something the agent has to remember."

### Scene 2: The idea (0:25 to 0:45)

- **On screen:** `docs/README.md` section 6, the table of problems and fixes.
- **Say:** "Skeleton Crew is an app template where the project enforces its own rules. Features are strips of small steps. Every step declares what it takes, returns, and touches. And Kiro's hooks make sure the agent can't finish until the rules pass."

### Scene 3: A rule being caught (0:45 to 1:15)

- **On screen:** add a step that returns `e.message` and widens a permission. Run `pnpm check`. Show the violations with file, line, and a link to the rule.
- **Say:** "Here I add a step the wrong way. The checker lists every violation, not just the first, each with a link to why the rule exists and how to fix it. Forty-one rules cover errors, naming, permissions, providers, environments, plans, and progress."

### Scene 4: The agent sent back (1:15 to 1:45) [not built yet: hooks]

- **On screen:** ask Kiro to add a feature. It tries to finish; the Stop hook sends it back with the list; it fixes the items and finishes.
- **Say:** "When the agent tries to finish, a Stop hook runs the checks and sends it back with the list. If it can't fix something in three tries, it stops and asks me instead of looping."

### Scene 5: Plans and protection (1:45 to 2:15) [not built yet: hooks]

- **On screen:** the agent tries to edit an existing shared step that the change plan does not list. The protection hook blocks it with a message to ask me. Then show the change plan with "affected strips".
- **Say:** "Before any code, a change plan lists which steps are reused, new, or modified, and every strip that depends on them. It counts only once I commit it. If the agent tries to edit something the plan doesn't cover, it's blocked."

### Scene 6: Two apps, one skeleton (2:15 to 2:40) [not built yet: core and apps]

- **On screen:** the two app repositories running offline from the same template.
- **Say:** "Here are two different apps from the same skeleton: [names and one line each]. Both run offline on my PC, with dev data kept apart from production."

### Scene 7: How it was built (2:40 to 3:00)

- **On screen:** `git log --oneline` showing one commit per task, then `progress.md`, then the spec's requirements.
- **Say:** "I built this with Kiro specs, one task per commit, with a progress log that records every decision, block, and deviation. The project is its own evidence that the process works."

## 4. Build log (moments worth showing)

Append at each checkpoint. Each entry: what happened, why it matters, and where to find it.

| When (UTC) | Moment | Why it is worth showing | Evidence |
|---|---|---|---|
| 2026-11-23 16:07 | Design written as documents before any code | Plans first, every default shown | commit 39fb4e9, `docs/` |
| 2026-11-23 16:24 | Concern raised about parallel agents editing shared steps; became change plans and requirements 16 to 21 | Requirements grew from conversation | commit 1eb6faa |
| 2026-11-23 16:30 | Worktrees per parallel sub-agent added at the builder's suggestion | Builder steering the design | commit e2a3521 |
| 2026-11-23 16:48 | Progress log and dated docs added so unfinished work can be resumed | Handles a real agent failure mode | commit 4d26d85 |
| 2026-11-23 16:50 | Task 1 blocked: TypeScript 7 lacks the compiler API; options given, builder chose | Agent stops and asks instead of guessing | `progress.md` blocked row, design D1 revision |
| 2026-11-23 17:32 | Checkpoint run found the console summary hid every violation when many rules failed; fixed | The process catching its own bug | task 14 notes in `tasks.md` |
| 2026-11-23 17:39 | Builder worried about a slow dev cycle; check measured and sped up | Strict without being slow | task 15 notes, `progress.md` |
| 2026-11-23 17:45 | Hook scripts built and tested (not yet switched on) | Enforcement ready | commits 453017a, f2e8eac |
| 2026-11-23 17:48 | Steering written: one always-loaded file plus files that load per folder (each function class, strips with the live catalog, ports, environments) | The right rules reach the agent when it needs them | commit 3bc043e, `.kiro/steering/` |
| 2026-11-23 17:48 | Self-check passes; 138 tests pass with the network switched off | Works offline on a low-spec PC | task 20 row in `progress.md` |
| 2026-11-23 17:58 | Hooks switched on and tested live: the agent's own protected writes were blocked, and the Stop hook sent it back over a planted console.log until it was removed | The best footage for scenes 4 and 5 | `docs/change-process.md` section 8 |
| 2026-11-23 18:01 | A sub-agent in its worktree was blocked from writing outside its task's file list and from touching the main tree; its work then passed verify | Parallel agents kept in their lanes, shown live | `docs/change-process.md` section 8 |
| 2026-11-23 18:42 | Skeleton core spec: requirements written, defaults P1 to P10 shown as proposed and confirmed by the builder one by one; design added 11 more proposals (D1 to D11), also confirmed before use | Every default shown before it is applied, in a real spec | commits b8db2bb, 3236431, `.kiro/specs/skeleton-core/` |
| 2026-11-23 18:42 | Reading the checker's rules while designing: every port, even clock and IDs, needs two adapters, a contract suite and an error map, so the design grew to six ports | The enforcement layer shaping the design of the code it checks | `design.md` section 5 |
| 2026-11-23 19:05 | Task 1 spike before building: Storybook starts in under 0.5 s (about 715 MB), `next build` works with `node:sqlite`, the checker accepts the new `uses` field. The agent also noticed it was starting work while the change plan was still a draft, and said so instead of flipping the status itself | Verify before relying on it; the agent leaves approvals to the builder | design section 9 results, `progress.md` task 1 |
| 2026-11-23 19:28 | Tasks 4 and 5 ran in parallel: two sub-agents in two git worktrees built the database port and the cache and storage ports. The hook blocked one agent's shell command that used a relative path (read as main tree), and it switched to absolute paths. Both branches verified against their task's file list, then merged in task order (259 tests pass). Two process bugs found: the progress rule flagged parallel tasks as 'started, never done', and merge refuses while an earlier worktree is open | Best footage for scene 5 (parallel agents kept in their lanes), and the process finding its own rough edges | commits 98e08f6, c2c6264, c83ec33, e49261c; `progress.md` |
| 2026-11-23 19:41 | Strip library built: the compiler rejects a strip whose steps do not chain, a skipped step that cannot be skipped, and a recover route to an unknown fallback; the budget, routing and invalidates checks fail when the module loads. Writing it showed that two confirmed decisions were too narrow (D5, and where recover steps live), so the agent proposed D5b and D12 instead of quietly changing them | Types and load-time checks catching mistakes; the agent flags a deviation from a confirmed default instead of applying it | commit for task 7, design section 11 |
| 2026-11-23 19:53 | The example works end to end in tests: profile.save and profile.view run against both databases and with the cache on and off, 49 strip tests. Writing it exposed a real design error caught by the tests: normalizing the display name to lowercase stored it lowercased, so the schema now keeps what the user typed and a separate lowercase key for uniqueness. Also found: the checker scans test files and flagged the library's own deliberately broken fixtures, so those tests moved out of src/ | Tests catching a bad assumption in the port design; the enforcement layer's rough edge reported honestly | `progress.md` task 9 rows, `src/strips/` |
