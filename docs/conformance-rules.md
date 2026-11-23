---
created: 2026-11-23
updated: 2026-11-23
---

# Conformance Rules

Every rule checked by the conformance script has one section here. Violation messages end with a pointer to their section, for example `see docs/conformance-rules.md#r01-no-console`.

How to run:

- `pnpm conformance`: all rules, summary in the console, full report in `.conformance/report.md`.
- `pnpm conformance --files a.ts,b.ts`: rules tied to single files report only those files. Rules that look across files still check the whole project.
- `pnpm conformance --strict`: warnings also fail.
- `pnpm test:conformance`: the script's own tests.

Exit codes: `0` passed (warnings allowed), `1` errors found (or warnings with `--strict`), `2` the script itself failed (bad config, parse error, a rule crashed). A script failure is never reported as a pass.

A rule whose project parts do not exist yet (for example no `src/steps` folder, or no git repository) is listed as **not applicable**. Not applicable means not checked, not passed.

Exceptions: there are no inline disable comments. A violation can only be excepted by an entry in `conformance.exceptions.json` with the rule, the target (a step or strip name, a file path, or a glob), a reason, and a date. That file is protected: the agent cannot edit it without the user's unlock.

## Section format

Each rule section has this shape, and the meta tests check that every label is present:

```markdown
## R00 rule-name

- **Severity:** error or warning
- **Catches:** what the rule detects
- **Why:** the problem it prevents
- **Failing example:** code that triggers it
- **Passing example:** code that does not
- **Fix:** what to change
- **Limits:** for heuristic rules, what it can miss or flag wrongly (optional for exact rules)
```

## Rules

No rules are registered yet. Sections are added with each rule.
