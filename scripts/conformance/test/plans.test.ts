import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { activePlans, parsePlan, planAllows, stripTestFile, summarizeActivePlans, workingPlans } from "../plans.ts";
import { makeProject } from "./helpers.ts";

const PLAN = `---
status: active
created: 2026-11-23
updated: 2026-11-23
---

## Strips in this spec

- profile.save
- profile.view

## Steps

| Step | Action | Used by (this spec) | Affected strips | Reason | Distinct from |
|---|---|---|---|---|---|
| db.user.findByEmail | reuse | profile.save | | | |
| db.user.setDisplayName | new | profile.save | | | |
| db.user.findById | modify | profile.view | profile.view, orders.list | Return deletedAt | |

## Existing files to edit

| File | Task | Reason |
|---|---|---|
| src/features/demo/steps/db/user.findById.ts | 2 | modify entry above |
| src/features/demo/strips/profile.view.strip.ts | 3 | uses the new field |

## Affected strip tests

- src/features/demo/strips/profile.view.strip.test.ts
- src/features/demo/strips/orders.list.strip.test.ts
`;

test("parses front matter, strips, steps, files, and affected tests with line numbers", () => {
  const p = parsePlan("x/change-plan.md", PLAN);
  assert.equal(p.status, "active");
  assert.equal(p.updated, "2026-11-23");
  assert.deepEqual(p.strips, ["profile.save", "profile.view"]);
  assert.deepEqual(p.steps.map((s) => [s.step, s.action]), [
    ["db.user.findByEmail", "reuse"],
    ["db.user.setDisplayName", "new"],
    ["db.user.findById", "modify"],
  ]);
  assert.deepEqual(p.steps[2]?.affected, ["profile.view", "orders.list"]);
  assert.equal(p.steps[0]?.line, 16);
  assert.deepEqual(p.files.map((f) => f.file), ["src/features/demo/steps/db/user.findById.ts", "src/features/demo/strips/profile.view.strip.ts"]);
  assert.equal(p.affectedTests.length, 2);
});

test("'None.' sections and plans without tables parse as empty", () => {
  const p = parsePlan("x", "---\nstatus: draft\n---\n\n## Strips in this spec\n\nNone.\n\n## Steps\n\nNone.\n");
  assert.deepEqual([p.strips, p.steps, p.files, p.affectedTests], [[], [], [], []]);
});

test("planAllows matches exact paths and globs; stripTestFile follows the convention", () => {
  const p = parsePlan("x", PLAN);
  assert.ok(planAllows([p], "src/features/demo/strips/profile.view.strip.ts"));
  assert.ok(!planAllows([p], "src/features/demo/strips/orders.list.strip.ts"));
  const g = { ...p, files: [{ file: "src/features/demo/steps/db/**", task: "1", reason: "", line: 1 }] };
  assert.ok(planAllows([g], "src/features/demo/steps/db/a/b.ts"));
  assert.equal(stripTestFile("src/features/demo/strips/a.strip.ts"), "src/features/demo/strips/a.strip.test.ts");
});

test("only the committed plan grants permission; an uncommitted edit grants nothing", () => {
  const proj = makeProject({ ".kiro/specs/demo/change-plan.md": PLAN.replace("status: active", "status: draft") });
  const g = (...a: string[]) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: proj.dir, encoding: "utf8" });
  try {
    g("init", "-q", "-b", "main");
    g("add", "-A");
    g("commit", "-q", "-m", "draft plan");
    proj.write(".kiro/specs/demo/change-plan.md", PLAN); // set active, not committed
    assert.equal(workingPlans(proj.dir, ".kiro/specs")[0]?.status, "active");
    assert.deepEqual(activePlans(proj.dir, ".kiro/specs"), []);
    g("commit", "-qam", "approve plan");
    assert.equal(activePlans(proj.dir, ".kiro/specs").length, 1);
    const [s] = summarizeActivePlans(proj.dir, ".kiro/specs");
    assert.ok(s);
    assert.equal(s.commits.length, 2);
    assert.deepEqual(s.changed, []);
    assert.equal(s.plannedUnchanged.length, 2);
  } finally {
    proj.cleanup();
  }
});
