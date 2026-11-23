import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { create, list, merge, remove, verify, type WtOptions } from "../worktree.ts";
import { makeProject, type Project } from "./helpers.ts";

const FM = "---\ncreated: 2999-12-31\nupdated: 2999-12-31\n---\n\n";
const TASKS = `${FM}# Tasks

- [ ] 1. One
  - Writes: src/a.ts

- [ ] 2. Two
  - Writes: src/b.ts

- [ ] 3. Shared
  - Mode: sequential
  - Writes: src/shared.ts

- [ ] 4. Four
  - Writes: src/c.ts
`;
const PLAN = `---\nstatus: active\ncreated: 2999-12-31\nupdated: 2999-12-31\n---\n\n## Steps\n\nNone.\n`;
const PROGRESS = `${FM}# Progress\n\n| When (UTC) | Task | State | Commit | Files | Next |\n|---|---|---|---|---|---|\n`;
// The test command fails when a BREAK file exists, so a post-merge failure can be produced on purpose.
const BREAK_TEST = `node -e "process.exit(require('fs').existsSync('BREAK') ? 1 : 0)"`;

function setup(): { p: Project; o: WtOptions; git: (cwd: string, ...a: string[]) => string } {
  const p = makeProject(
    {
      ".kiro/specs/demo/tasks.md": TASKS,
      ".kiro/specs/demo/change-plan.md": PLAN,
      ".kiro/specs/demo/progress.md": PROGRESS,
      ".gitignore": ".worktrees/\n.conformance/\n",
      "src/base.ts": "export const base = 1;\n",
    },
    (c) => {
      c.checks = { typecheck: null, test: BREAK_TEST, testFiles: null };
    },
  );
  const git = (cwd: string, ...a: string[]): string => {
    const r = spawnSync("git", a, { cwd, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${a.join(" ")}: ${r.stderr}`);
    return r.stdout.trim();
  };
  git(p.dir, "init", "-q", "-b", "main");
  git(p.dir, "config", "user.name", "test");
  git(p.dir, "config", "user.email", "test@localhost");
  git(p.dir, "add", "-A");
  git(p.dir, "commit", "-q", "-m", "base");
  return { p, o: { root: p.dir, install: false }, git };
}

function commitIn(dir: string, git: (cwd: string, ...a: string[]) => string, files: Record<string, string>, msg: string): void {
  for (const [f, t] of Object.entries(files)) writeFileSync(join(dir, f), t);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", msg);
}

test("create respects sequential tasks, the parallel limit, and a clean main tree", () => {
  const { p, o } = setup();
  try {
    assert.match(create("3", o).message, /sequential/);
    assert.ok(create("1", o).ok);
    assert.ok(existsSync(join(p.dir, ".worktrees/task-1/src/base.ts")));
    assert.ok(create("2", o).ok);
    const r = create("4", o);
    assert.equal(r.ok, false);
    assert.match(r.message, /limit 2/);
    assert.match(list(o).message, /task 1: .*\(not verified\)/);
  } finally {
    p.cleanup();
  }
});

test("verify fails on files outside Writes, then passes; merge goes in task order", () => {
  const { p, o, git } = setup();
  try {
    create("1", o);
    create("2", o);
    const w1 = join(p.dir, ".worktrees/task-1");
    const w2 = join(p.dir, ".worktrees/task-2");
    commitIn(w1, git, { "src/a.ts": "export const a = 1;\n", "src/extra.ts": "export const x = 1;\n" }, "task 1 with extra");
    const bad = verify("1", o);
    assert.equal(bad.ok, false);
    assert.match(bad.message, /outside task 1's Writes list: src\/extra\.ts/);
    git(w1, "rm", "-q", "src/extra.ts");
    git(w1, "commit", "-q", "-m", "drop extra");
    assert.ok(verify("1", o).ok, verify("1", o).message);

    commitIn(w2, git, { "src/b.ts": "export const b = 1;\n" }, "task 2");
    assert.ok(verify("2", o).ok);
    const early = merge("2", o);
    assert.equal(early.ok, false);
    assert.match(early.message, /task order: task\(s\) 1 are still open/);

    assert.ok(merge("1", o).ok);
    assert.ok(existsSync(join(p.dir, "src/a.ts")));
    assert.ok(remove("1", o).ok);
    assert.ok(merge("2", o).ok, "task 2 can merge once task 1 is removed");
  } finally {
    p.cleanup();
  }
});

test("merge refuses an unverified tip, aborts cleanly on conflict, and undoes itself when the check fails", () => {
  const { p, o, git } = setup();
  try {
    create("1", o);
    const w1 = join(p.dir, ".worktrees/task-1");
    commitIn(w1, git, { "src/a.ts": "export const a = 1;\n" }, "task 1");
    assert.match(merge("1", o).message, /must pass verify/);
    assert.ok(verify("1", o).ok);

    // Conflict: the main branch changed the same file meanwhile.
    commitIn(p.dir, git, { "src/a.ts": "export const a = 2;\n" }, "main edits a.ts");
    const before = git(p.dir, "rev-parse", "HEAD");
    const c = merge("1", o);
    assert.equal(c.ok, false);
    assert.match(c.message, /conflicts in src\/a\.ts/);
    assert.equal(git(p.dir, "rev-parse", "HEAD"), before);
    assert.equal(git(p.dir, "status", "--porcelain"), "");

    // Failed check after a clean merge: the merge commit is undone.
    git(p.dir, "reset", "-q", "--hard", "HEAD~1");
    commitIn(p.dir, git, { BREAK: "1\n" }, "main breaks the test");
    const pre = git(p.dir, "rev-parse", "HEAD");
    const f = merge("1", o);
    assert.equal(f.ok, false);
    assert.match(f.message, /merge was undone/);
    assert.equal(git(p.dir, "rev-parse", "HEAD"), pre);
  } finally {
    p.cleanup();
  }
});

test("remove refuses unmerged work unless forced", () => {
  const { p, o, git } = setup();
  try {
    create("1", o);
    commitIn(join(p.dir, ".worktrees/task-1"), git, { "src/a.ts": "export const a = 1;\n" }, "task 1");
    const r = remove("1", o);
    assert.equal(r.ok, false);
    assert.match(r.message, /not merged/);
    const f = remove("1", { ...o, force: true });
    assert.ok(f.ok, f.message);
    assert.ok(!existsSync(join(p.dir, ".worktrees/task-1")));
    assert.equal(git(p.dir, "branch", "--list", "task/1"), "");
  } finally {
    p.cleanup();
  }
});
