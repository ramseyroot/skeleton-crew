# Requirements Document: Enforcement Setup

## Introduction

The skeleton's rules (see `docs/function-strips-plan.md`, `docs/provider-ports.md`, `docs/environments.md`) are only useful if they are followed everywhere, not in the first few functions an agent writes. This spec covers the enforcement layer that makes the rules checkable:

- a **conformance script** that lists every rule violation in the project,
- **steering files** that give the agent the right rules at the right time,
- **hooks** that stop the agent from finishing while violations remain, and that protect the enforcement files themselves.

This spec does not cover the skeleton's core library (`Result`, `defineStep()`, `defineStrip()`), the ports and adapters, Storybook, or any app. Those come in later specs. The conformance script is built and tested first against fixture projects, so it does not wait for the core library.

### Terms

- **Rule**: one checkable requirement with an ID (for example `R03 no-console`).
- **Violation**: one place where a rule is broken.
- **Exception**: a recorded, reasoned permission for one violation to exist.
- **Protected file**: a file the agent must not change without the user's approval.

### Values marked "assumption"

Some numbers below (output limits, size limits, retry caps) are starting values to confirm during review.

---

## Requirements

### Requirement 1: The conformance script lists every violation

**User Story:** As a developer, I want one command that lists every rule violation in the project, so that nothing is skipped because a few files were fixed.

#### Acceptance Criteria

1. WHEN the conformance script runs, THEN it SHALL check all files in the configured source folders and report every violation it finds, and SHALL NOT stop at the first one.
2. WHEN at least one error-level violation exists, THEN the script SHALL exit with a non-zero code.
3. WHEN no error-level violation exists, THEN the script SHALL exit with code 0.
4. EACH violation SHALL include the rule ID, the file path, the line number, a one-line message, and the name of the rule's documentation entry.
5. THE console output SHALL group violations by rule, show a count per rule, and use a stable order so that two runs on the same code give identical output.
6. THE script SHALL write a full report file to a configured location that is excluded from version control.
7. THE console output SHALL stay within a configured character limit (assumption: 3,000 characters). WHEN the output would exceed it, THEN the script SHALL print the counts per rule, the first violations of each rule, and the path of the full report.
8. THE script SHALL support a full run and a run limited to a list of files.
9. EACH rule SHALL have a severity of `error` or `warning`. WHEN only warnings exist, THEN the script SHALL exit with code 0, unless run in strict mode, in which case it SHALL exit non-zero.

### Requirement 2: Code pattern rules

**User Story:** As a developer, I want the basic code rules checked automatically, so that errors never look like values and logging stays behind its port.

#### Acceptance Criteria

1. WHEN a file outside the logger adapter calls `console`, THEN the script SHALL report an error for rule `no-console`.
2. WHEN a step file returns an error's message or `String(error)` as a value, or throws a string, THEN the script SHALL report an error for rule `no-error-as-value`.
3. WHEN a file outside `adapters/<port>/<provider>/` imports a package on the configured provider list (drivers, SDKs, query builders), THEN the script SHALL report an error for rule `provider-import-boundary`.
4. THE provider package list and the allowed folders SHALL come from configuration, not from the script's code.
5. WHEN a step file contains raw SQL strings or query-builder calls outside an adapter, THEN the script SHALL report an error for rule `no-raw-queries`.

### Requirement 3: Naming and registry rules

**User Story:** As a developer, I want step and strip names checked, so that similarly named functions cannot be confused and reuse is traceable.

#### Acceptance Criteria

1. WHEN a step name does not match `<class>.<domain>.<verb>` or its class is not a known class, THEN the script SHALL report an error for rule `step-name-format`.
2. WHEN a strip name does not match `<domain>.<verb>`, THEN the script SHALL report an error for rule `strip-name-format`.
3. WHEN two steps, or two strips, have the same name, THEN the script SHALL report an error for rule `unique-names`, naming both locations.
4. WHEN two names are near-duplicates (equal after normalizing case and common verbs, such as `getUser` and `fetchUser`), THEN the script SHALL report a warning for rule `near-duplicate-names`.
5. WHEN a step file exports a function that is not created through `defineStep()`, THEN the script SHALL report an error for rule `step-must-be-defined`.
6. WHEN a step's manifest is missing its input, output, permissions, or error list, THEN the script SHALL report an error for rule `step-manifest-complete`, naming the missing field.

### Requirement 4: Strip rules

**User Story:** As a developer, I want each strip checked as a whole, so that routing, permissions, and cache invalidation are never forgotten.

#### Acceptance Criteria

1. WHEN a strip has a step with no routing entry and no `"*"` entry, THEN the script SHALL report an error for rule `strip-routing-complete`.
2. WHEN the combined permissions of a strip's steps exceed the strip's budget, THEN the script SHALL report an error for rule `strip-budget`, naming the step and the excess permission.
3. WHEN a strip contains a step that writes and the strip has no `invalidates` entry (an empty list counts as an entry), THEN the script SHALL report an error for rule `strip-invalidates`.
4. WHEN a routing entry names a step that is not in the strip, THEN the script SHALL report an error for rule `strip-routing-unknown-step`.

Type compatibility between consecutive steps is checked by the compiler, not by the script (see Requirement 11).

### Requirement 5: Catalog and permission-widening rules

**User Story:** As a developer, I want a generated catalog, so that I and the agent can see which steps exist and what they touch before creating or reusing one.

#### Acceptance Criteria

1. THE script SHALL generate `docs/generated/catalog.md` with one line per step (name, class, input, output, permissions, strips that use it) and one line per strip (name, steps, budget).
2. THE catalog SHALL be in a stable order, so that regenerating without code changes produces no diff.
3. WHEN the committed catalog differs from the freshly generated one, THEN the script SHALL report an error for rule `catalog-current`.
4. WHEN a step's permissions, input, or output differ from the committed catalog's entry for that step, THEN the script SHALL report an error for rule `no-widening`, showing the old and new values.
5. WHEN the change is a recorded and approved exception (Requirement 9), THEN the script SHALL accept it and SHALL list it in the report.
6. THE catalog SHALL be compact enough to be loaded by steering (assumption: no more than 120 characters per line).

### Requirement 6: Ports and adapters rules

**User Story:** As a developer, I want every port to have two adapters and a shared contract test, so that no port is shaped to one provider.

#### Acceptance Criteria

1. WHEN a port under `ports/` has fewer than two adapter folders under `adapters/<port>/`, THEN the script SHALL report an error for rule `port-two-adapters`.
2. WHEN a port has no `contract.test.ts`, THEN the script SHALL report an error for rule `port-contract-test`.
3. WHEN an adapter's tests do not call the port's contract suite, THEN the script SHALL report an error for rule `adapter-runs-contract`.
4. WHEN an adapter has no error mapping table file, THEN the script SHALL report an error for rule `adapter-error-map`.
5. WHEN a port's signatures include a type imported from a provider package, THEN the script SHALL report an error for rule `port-domain-types`.

### Requirement 7: Environment rules

**User Story:** As a developer, I want environment safety checked automatically, so that dev data and production data cannot mix by accident.

#### Acceptance Criteria

1. WHEN a profile's config does not validate against the config schema, THEN the script SHALL report an error for rule `profile-valid`.
2. WHEN the `local` profile lists a host outside its allowed local hosts, THEN the script SHALL report an error for rule `local-hosts-only`.
3. WHEN a port used by a profile has no registered adapter for it, THEN the script SHALL report an error for rule `profile-adapter-registered`.
4. WHEN a production secret name appears in a non-production env file, THEN the script SHALL report an error for rule `no-prod-secrets-outside-prod`. THE list of production secret names SHALL come from configuration.
5. WHEN a script that seeds, resets, or migrates down lacks the profile guard (refusing to run on `prod`), THEN the script SHALL report an error for rule `destructive-script-guard`.

### Requirement 8: Coverage file integration

**User Story:** As a developer, I want the app coverage check part of the same run, so that I use one command.

#### Acceptance Criteria

1. WHEN coverage files exist at the configured location, THEN the conformance script SHALL run the existing coverage checker (`scripts/check-coverage.mjs`) on each and include its errors as violations of rule `coverage-valid`.
2. WHEN a coverage file has `unplanned` items, THEN they SHALL appear as warnings.
3. WHEN no coverage files exist (for example in the skeleton repository itself), THEN the check SHALL pass without error.

### Requirement 9: Exceptions are recorded and reviewed

**User Story:** As a developer, I want exceptions to rules to be rare, recorded, and visible, so that the agent cannot silence a rule to make a check pass.

#### Acceptance Criteria

1. THE script SHALL NOT accept inline comments that disable a rule.
2. THE script SHALL accept exceptions only from one exceptions file, where each entry names the rule, the file or name it applies to, a reason, and the date.
3. WHEN an exception entry has no reason, THEN the script SHALL report an error for rule `exception-valid`.
4. WHEN an exception no longer matches any violation, THEN the script SHALL report a warning for rule `exception-unused`.
5. THE report SHALL list every active exception and the total count.
6. THE exceptions file SHALL be a protected file (Requirement 12).

### Requirement 10: The script is tested against fixture projects

**User Story:** As a developer, I want proof that each rule detects what it should and leaves clean code alone, so that a passing check means something.

#### Acceptance Criteria

1. THE repository SHALL include a fixture project with one deliberately broken example per rule, and one clean example per rule.
2. WHEN the script's test suite runs, THEN for each rule it SHALL assert that the broken fixture produces the expected violation, with rule ID and location, and that the clean fixture produces none.
3. THE test suite SHALL run without network access.
4. WHEN a rule is added without a broken and a clean fixture, THEN the test suite SHALL fail.
5. THE script SHALL run on a project that has no core library yet, with rules that depend on missing parts reported as `not-applicable` (not as passing) in the report summary.

### Requirement 11: Compiler and test checks run alongside

**User Story:** As a developer, I want the hook to run the type checker and tests as well, so that type compatibility between steps and behavior are verified too.

#### Acceptance Criteria

1. THE check command SHALL run, in order: the conformance script, the type checker, and the test suite.
2. WHEN the type checker or the test runner is not configured yet, THEN the command SHALL print a clear `not configured` notice for that check, and SHALL NOT report it as passed.
3. WHEN any configured check fails, THEN the command SHALL exit with a non-zero code.
4. THE output of the type checker and test runner SHALL be capped under the same limit as Requirement 1.7.

### Requirement 12: Hooks block unfinished work and protect enforcement files

**User Story:** As a developer, I want hooks that stop the agent from finishing while violations remain, and from editing the rules that judge it, so that requirements are not skipped.

#### Acceptance Criteria

1. WHEN the agent stops, THEN a Stop hook SHALL run the check command from Requirement 11.
2. WHEN the check command fails, THEN the hook SHALL return its capped output to the agent and make it continue working.
3. WHEN the agent attempts to write to a protected file, THEN a pre-tool-use hook SHALL block the write and tell the agent to ask the user.
4. THE protected files SHALL include: the exceptions file, the conformance configuration, the hook files, the steering files, and the conformance script's rule definitions.
5. THE hooks SHALL NOT affect edits the user makes by hand.
6. THE hook files and the check command SHALL be documented in one place, including how to disable the protection for a deliberate change.

### Requirement 13: The Stop hook cannot loop forever

**User Story:** As a developer, I want the Stop hook to give up cleanly when a violation cannot be fixed by the agent, so that a needed human decision does not cause an endless loop.

#### Acceptance Criteria

1. THE Stop hook SHALL count consecutive blocks within one task.
2. WHEN the count reaches a configured limit (assumption: 3), THEN the hook SHALL allow the agent to stop, and SHALL tell the agent to report the remaining violations and what decision is needed.
3. WHEN the check command passes, THEN the count SHALL reset.
4. THE hook SHALL write the remaining violations to the full report file, so that they are not lost when it stops blocking.

### Requirement 14: Steering gives the right rules at the right time

**User Story:** As a developer, I want short steering files that load by file pattern, so that each kind of file gets its rules without loading everything.

#### Acceptance Criteria

1. THE project SHALL include one `always` steering file with the rules that apply everywhere: never return errors as values, read the catalog before creating or reusing a step, never widen an existing step, never edit protected files, run the check command before finishing.
2. THE project SHALL include one `fileMatch` steering file per function class, loaded for that class's folder (`src/steps/<class>/**`), each containing that class's rules and a checklist.
3. THE project SHALL include a `fileMatch` steering file for `src/strips/**` that references the generated catalog.
4. THE project SHALL include a `fileMatch` steering file for `src/adapters/**` and `src/ports/**` with the port and adapter rules.
5. EACH steering file SHALL stay within a size limit (assumption: 60 lines for the `always` file and 80 lines for the others), and the total SHALL stay under the documented resource budget for custom agents.
6. EACH rule ID in the script SHALL be mentioned in at least one steering file or in the rule documentation, with a one-line reason and a one-line fix.
7. THE steering files SHALL state which rules are enforced by the check command, so that the agent knows a violation will be caught.

### Requirement 15: Rule documentation

**User Story:** As a developer, I want each rule documented once, so that violation messages can point to an explanation and fix.

#### Acceptance Criteria

1. THE project SHALL include a rules document with one entry per rule: ID, severity, what it catches, why, a failing example, a passing example, and how to fix.
2. WHEN a violation is printed, THEN its message SHALL name the rule's entry in the rules document.
3. WHEN a rule exists in the script without an entry in the rules document, THEN the test suite SHALL fail.

### Requirement 16: Every change to existing code starts with an approved change plan

**User Story:** As a developer, I want to see which existing steps, strips, and shared files a change will touch, and which other strips depend on them, before any code is edited, so that a change to one strip does not silently break another.

#### Acceptance Criteria

1. WHEN a spec adds or changes a strip, THEN its folder SHALL contain a change plan file (`change-plan.md`) before any task that edits code runs.
2. THE change plan SHALL list every step the work needs, each marked `reuse`, `new`, or `modify`.
3. THE change plan SHALL list every existing file the work will edit, under the guarded folders (steps, strips, ports, adapters, core library).
4. FOR each `modify` entry, THE change plan SHALL list every strip that uses the step, taken from the catalog, and the test files of those strips.
5. WHEN a `reuse` entry's input, output, or permissions do not match the catalog, THEN the conformance script SHALL report an error for rule `plan-reuse-matches`.
6. WHEN a `modify` entry's list of affected strips differs from the catalog's "used by" list, THEN the conformance script SHALL report an error for rule `plan-impact-complete`.
7. A change plan SHALL count as approved only in the version committed to git. Uncommitted edits to the plan SHALL NOT change what is allowed.
8. THE change plan SHALL have a status (`draft`, `active`, `done`). Only `active` plans grant permission to edit existing files.

### Requirement 17: Changes to shared existing code run alone and in order

**User Story:** As a developer, I want changes to existing shared steps to happen one at a time, before the work that depends on them, so that parallel agents never edit the same shared code.

#### Acceptance Criteria

1. EACH `modify` entry SHALL have its own task in `tasks.md`, placed before any task that depends on the modified step.
2. TASKS that edit existing files SHALL be marked `sequential` in `tasks.md`.
3. `sequential` tasks SHALL be run one at a time by the main agent, not dispatched to sub-agents and not run with "run all tasks", because Kiro's parallel waves cannot be forced to be sequential.
4. WHEN a `modify` task finishes, THEN the tests of every affected strip listed in the change plan SHALL pass before the next task starts.
5. THE check command SHALL run the tests of every affected strip in the active change plans, in addition to the configured test command.

### Requirement 18: Parallel work only creates new files, with disjoint write sets

**User Story:** As a developer, I want parallel sub-agents to work only on separate new files, so that one agent's save never overwrites another's.

#### Acceptance Criteria

1. EACH task in `tasks.md` SHALL list the files it writes on a `Writes:` line.
2. WHEN two tasks that are not marked `sequential` list the same file, THEN the conformance script SHALL report an error for rule `tasks-write-disjoint`.
3. WHEN a task not marked `sequential` lists a file that already exists in git, THEN the conformance script SHALL report an error for rule `parallel-new-files-only`.
4. WHEN a task has no `Writes:` line, THEN the conformance script SHALL report an error for rule `tasks-write-declared`.
5. BEFORE dispatching sub-agents, THE main agent SHALL run the conformance script on `tasks.md` and SHALL NOT dispatch while these rules fail.

### Requirement 19: The protection hook blocks unplanned edits to existing code

**User Story:** As a developer, I want agent edits to existing shared code blocked unless the approved plan allows them, so that the plan is followed during the work and not only checked afterwards.

#### Acceptance Criteria

1. WHEN the agent attempts to write a file that exists in git under a guarded folder, THEN the protection hook SHALL block the write unless an `active`, committed change plan lists that file.
2. WHEN the agent creates a new file in a guarded folder, THEN the hook SHALL allow it.
3. WHEN the hook blocks a write, THEN its message SHALL name the file, say that it is not in the active change plan, and tell the agent to propose a plan change to the user.
4. THE change plan files SHALL NOT be protected from agent edits, since the agent drafts them. Approval is the commit (16.7).
5. THE hook SHALL work without knowing which agent or sub-agent is writing.

### Requirement 20: A git-based check catches unplanned changes after the fact

**User Story:** As a developer, I want a check that compares the work with the last commit, so that changes the hook missed (for example through shell commands) are still caught.

#### Acceptance Criteria

1. WHEN a file that exists in git under a guarded folder has changed and no `active` committed change plan lists it, THEN the conformance script SHALL report an error for rule `change-in-plan`.
2. WHEN a step marked `modify` changed its input, output, or permissions, THEN rule `no-widening` SHALL still apply, and the change SHALL also require an exception entry (Requirement 9).
3. THE report SHALL list, for each active plan, the files changed, the files planned but unchanged, and the affected strips' test results.

### Requirement 21: The change process is documented

**User Story:** As a developer, I want the change process written down once, so that every future spec and agent follows the same steps.

#### Acceptance Criteria

1. THE project SHALL include `docs/change-process.md` describing: writing the change plan, approval by commit, the order of tasks, sequential and parallel tasks, how sub-agents are dispatched, what the hooks and checks enforce, and their limits.
2. THE `always` steering file SHALL state the core of the process in a few lines and point to that document.
3. THE spec template guidance (in `docs/change-process.md`) SHALL show the `change-plan.md` format and the `Writes:` and `sequential` notation in `tasks.md`.

### Requirement 22: The parent agent compares all strips in a spec before work starts

**User Story:** As a developer, I want the strips planned in one spec compared with each other, not only with the existing catalog, so that two parallel agents never build the same new step twice.

#### Acceptance Criteria

1. THE change plan SHALL list every strip in the spec and, for each planned step, which of those strips use it.
2. WHEN a `new` step is used by more than one strip in the spec, THEN it SHALL be created by exactly one `sequential` task placed before the tasks of the strips that use it, and those strips SHALL treat it as already existing. WHEN this is not the case, THEN the conformance script SHALL report an error for rule `plan-shared-new-once`.
3. WHEN a planned `new` step is a near-duplicate of another planned or existing step (same normalization as rule `near-duplicate-names`), THEN the conformance script SHALL report an error for rule `plan-no-near-duplicates`, unless the plan entry has a `Distinct from` note naming the other step and the reason.
4. THE parent agent SHALL also point out, in the plan, any steps it judges similar in purpose under unrelated names, for the user to decide. This part is a judgement and is not checked mechanically.

### Requirement 23: Parallel tasks run in separate git worktrees

**User Story:** As a developer, I want each parallel sub-agent to work in its own git worktree and branch, so that each agent's changes are separate, attributable, and merged only after checks.

#### Acceptance Criteria

1. THE project SHALL use pnpm as its package manager, so that worktree installs reuse one shared package store.
2. THE project SHALL provide a worktree command with `create`, `verify`, `merge`, and `remove` actions for one task.
3. `create` SHALL make a worktree under `.worktrees/task-<id>/` on a new branch `task/<id>` from the current commit, and install dependencies with pnpm (offline when the store already has the packages).
4. `create` SHALL refuse when the number of open worktrees has reached a configured limit (assumption: 2, for a low-spec PC).
5. `verify` SHALL fail WHEN the branch changes any file not in the task's `Writes:` list, or WHEN the check command fails inside the worktree.
6. `merge` SHALL run only after `verify` passes, merge the branch into the main branch, then run the check command on the result. WHEN the merge has conflicts or the check fails, THEN it SHALL stop, leave the main branch as it was before the merge, and report to the user.
7. Merges SHALL happen in task order.
8. `remove` SHALL delete the worktree folder and its branch, and SHALL refuse WHEN the branch has unmerged commits, unless forced by the user.
9. `.worktrees/` SHALL be ignored by git.

### Requirement 24: The protection hook understands worktrees

**User Story:** As a developer, I want the protection hook to apply the same rules inside worktrees, and to hold each sub-agent to its task's file list, so that the guards are not bypassed by working in another folder.

#### Acceptance Criteria

1. WHEN a write targets a path under `.worktrees/task-<id>/`, THEN the hook SHALL apply every protection rule to the path relative to that worktree.
2. WHEN a write inside `.worktrees/task-<id>/` targets a file not in task `<id>`'s `Writes:` list (read from the committed `tasks.md`), THEN the hook SHALL block it.
3. WHILE any task worktree exists, THE hook SHALL block agent writes to the guarded folders of the main working tree, because the main tree is not edited during the parallel phase.

### Requirement 25: Sub-agent behavior is tested before it is relied on

**User Story:** As a developer, I want the undocumented behaviors confirmed by a test, so that the process does not depend on assumptions.

#### Acceptance Criteria

1. BEFORE the parallel phase is used for real work, a test session SHALL confirm and record: whether a sub-agent can be confined to a worktree folder, whether sub-agents trigger the Stop hook, which fields the Stop and task hooks receive, and the name of the Stop hook's reason field.
2. THE results SHALL be written to `docs/change-process.md`.
3. WHEN a sub-agent cannot be confined to its worktree, THEN the process SHALL still hold, because writes outside the worktree are blocked by Requirement 24.3 and caught by rule `change-in-plan`.

---

## Out of scope

- The core library (`Result`, `defineStep()`, `defineStrip()`, the step wrapper, logger) and its tests.
- Ports and adapters implementations.
- Storybook setup and stories.
- CI pipeline configuration. The check command and its exit codes are written so CI can call them.
- Any app, mobile code, or production deployment.

## Dependencies and ordering

- Rules that inspect `defineStep()`, `defineStrip()`, the catalog, and ports depend on the core library's shape. They are written and tested first against fixtures that follow the shapes in `docs/function-strips-plan.md`, and are adjusted when the core library is built.
- Requirements 16 to 25 apply to this spec's own tasks as far as possible: there is no existing code yet, so every task creates new files, and the change plan for this spec lists only new files.
- The Stop hook and the protection hook are enabled last, after the script's test suite passes, because the protection hook would otherwise block the agent from finishing this setup.

## Decisions for the design stage

These are not decided here and are settled in `design.md`:

1. How the script reads code: the TypeScript compiler API, ESLint rules, a structural search tool, or a mix. This affects dependencies.
2. Exact hook trigger names and file format, checked against Kiro's current hook documentation.
3. Where reports and the loop counter are stored.
4. How steps and strips are discovered (by folder and naming convention, or by reading `defineStep()` calls).
5. The configuration file format and location.
