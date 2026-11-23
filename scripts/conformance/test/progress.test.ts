import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { commitOfRow, parseProgress, pathsInCell } from "../progress.ts";
import { makeProject, repoRoot } from "./helpers.ts";

test("parses rows with line numbers, skipping the header and separator", () => {
  const rows = parseProgress(
    "# P\n\n| When | Task | State | Commit | Files | Next |\n|---|---|---|---|---|---|\n| 2026-11-23 10:00 | 1 | Done | this | a/b.ts | Next |\n",
  );
  assert.deepEqual(rows.map((r) => [r.task, r.state, r.commit, r.line]), [["1", "done", "this", 5]]);
});

test("this spec's progress.md parses and every ticked task has a done row", () => {
  const dir = join(repoRoot, ".kiro/specs/enforcement-setup");
  const rows = parseProgress(readFileSync(join(dir, "progress.md"), "utf8"));
  const ticked = readFileSync(join(dir, "tasks.md"), "utf8").match(/^- \[x\] (\d+)\./gm) ?? [];
  for (const t of ticked) {
    const id = (/(\d+)/.exec(t) as RegExpExecArray)[1];
    assert.ok(rows.some((r) => r.task === id && r.state === "done"), `task ${id}`);
  }
});

test("only path-like tokens under existing top-level folders are checked", () => {
  const got = pathsInCell(repoRoot, "docs/README.md, rules/R01 to R04, scripts/conformance/{a,b}.ts, package.json (12 tests pass)");
  assert.deepEqual(got, ["docs/README.md"]);
});

test("a 'this' row resolves to the commit that added it", () => {
  const p = makeProject({ "progress.md": "| When | Task | State | Commit | Files | Next |\n|---|---|---|---|---|---|\n" });
  const g = (...a: string[]) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: p.dir, encoding: "utf8" });
  try {
    g("init", "-q", "-b", "main");
    g("add", "-A");
    g("commit", "-q", "-m", "base");
    const row = "| 2026-11-23 10:00 | 1 | done | this | x | y |";
    assert.equal(commitOfRow(p.dir, "progress.md", row), null, "not committed yet");
    p.write("progress.md", readFileSync(join(p.dir, "progress.md"), "utf8") + row + "\n");
    g("commit", "-qam", "task 1");
    const id = g("rev-parse", "--short", "HEAD").stdout.trim();
    assert.equal(commitOfRow(p.dir, "progress.md", row), id);
  } finally {
    p.cleanup();
  }
});
