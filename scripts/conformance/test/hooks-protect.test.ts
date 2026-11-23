import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shellWriteTargets } from "../hooks/protect.ts";
import { create } from "../worktree.ts";
import { makeProject, repoRoot, type Project } from "./helpers.ts";

const HOOK = join(repoRoot, "scripts/conformance/hooks/protect.ts");

function hook(cwd: string, toolInput: unknown, shell = false): { code: number | null; err: string; ms: number } {
  const start = Date.now();
  const r = spawnSync(process.execPath, [HOOK, ...(shell ? ["--shell"] : [])], {
    cwd,
    input: JSON.stringify({ hook_event_name: "PreToolUse", cwd, session_id: "s", tool_name: shell ? "execute_bash" : "fs_write", tool_input: toolInput }),
    encoding: "utf8",
  });
  return { code: r.status, err: r.stderr, ms: Date.now() - start };
}
const write = (cwd: string, path: string) => hook(cwd, { path, text: "x" });
const shell = (cwd: string, command: string) => hook(cwd, { command }, true);

const FM = "---\ncreated: 2999-12-31\nupdated: 2999-12-31\n---\n\n";
const plan = (status: string, file: string) =>
  `---\nstatus: ${status}\ncreated: 2999-12-31\nupdated: 2999-12-31\n---\n\n## Existing files to edit\n\n| File | Task | Reason |\n|---|---|---|\n| ${file} | 1 | x |\n`;

function repo(files: Record<string, string> = {}): { p: Project; git: (...a: string[]) => void } {
  const p = makeProject({ "src/steps/db/a.ts": "export const a = 1;\n", ".gitignore": ".worktrees/\n.conformance/\n", ...files });
  const git = (...a: string[]): void => {
    const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: p.dir, encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
  };
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  return { p, git };
}

test("protected files are blocked until the user unlocks, and the unlock expires", () => {
  const { p } = repo();
  try {
    const r = write(p.dir, "conformance.config.json");
    assert.equal(r.code, 2);
    assert.match(r.err, /protected enforcement file[\s\S]*touch \.conformance\/unlock/);
    assert.equal(write(p.dir, join(p.dir, ".kiro/steering/core-rules.md")).code, 2, "absolute paths too");
    mkdirSync(join(p.dir, ".conformance"), { recursive: true });
    const unlock = join(p.dir, ".conformance/unlock");
    writeFileSync(unlock, "");
    assert.equal(write(p.dir, "conformance.config.json").code, 0);
    const old = (Date.now() - 31 * 60_000) / 1000;
    utimesSync(unlock, old, old);
    assert.equal(write(p.dir, "conformance.config.json").code, 2);
    assert.equal(write(p.dir, ".conformance/unlock").code, 2, "the agent cannot create the unlock itself");
  } finally {
    p.cleanup();
  }
});

test("existing guarded files need an active committed plan; new files and other folders are allowed", () => {
  const { p, git } = repo();
  try {
    assert.equal(write(p.dir, "src/steps/db/new.ts").code, 0);
    assert.equal(write(p.dir, "docs/notes.md").code, 0);
    assert.equal(write(p.dir, "/tmp/outside.txt").code, 0);
    const blocked = write(p.dir, "src/steps/db/a.ts");
    assert.equal(blocked.code, 2);
    assert.match(blocked.err, /no active committed change plan lists it/);

    p.write(".kiro/specs/demo/change-plan.md", plan("active", "src/steps/db/a.ts"));
    assert.equal(write(p.dir, "src/steps/db/a.ts").code, 2, "uncommitted plan grants nothing");
    git("add", "-A");
    git("commit", "-q", "-m", "approve plan");
    assert.equal(write(p.dir, "src/steps/db/a.ts").code, 0);
    mkdirSync(join(p.dir, ".conformance"), { recursive: true });
    writeFileSync(join(p.dir, ".conformance/unlock"), "");
    assert.equal(write(p.dir, "src/steps/db/other-existing.ts").code, 0, "not at HEAD, so new");
  } finally {
    p.cleanup();
  }
});

test("inside a worktree only the task's files may be written, and the main tree's guarded folders are frozen", () => {
  const tasks = `${FM}# Tasks\n\n- [ ] 1. One\n  - Writes: src/steps/pure/price.ts\n`;
  const { p } = repo({
    ".kiro/specs/demo/tasks.md": tasks,
    ".kiro/specs/demo/change-plan.md": plan("active", "src/none.ts"),
    ".kiro/specs/demo/progress.md": `${FM}| When | Task | State | Commit | Files | Next |\n|---|---|---|---|---|---|\n`,
  });
  try {
    assert.ok(create("1", { root: p.dir, install: false }).ok);
    assert.equal(write(p.dir, ".worktrees/task-1/src/steps/pure/price.ts").code, 0);
    const other = write(p.dir, ".worktrees/task-1/src/steps/pure/other.ts");
    assert.equal(other.code, 2);
    assert.match(other.err, /not in task 1's Writes list/);
    assert.equal(write(p.dir, ".worktrees/task-1/conformance.config.json").code, 2, "protected inside worktrees too");
    const main = write(p.dir, "src/steps/db/brand-new.ts");
    assert.equal(main.code, 2);
    assert.match(main.err, /task worktrees are open/);
    assert.equal(write(p.dir, "docs/notes.md").code, 0);
  } finally {
    p.cleanup();
  }
});

test("shell commands: writes to protected or guarded paths are blocked, reads are not", () => {
  const { p } = repo();
  try {
    assert.equal(shell(p.dir, "echo '[]' > conformance.exceptions.json").code, 2);
    assert.equal(shell(p.dir, "cat conformance.config.json > /tmp/copy.json").code, 0);
    assert.equal(shell(p.dir, "sed -i 's/a/b/' src/steps/db/a.ts").code, 2);
    assert.equal(shell(p.dir, "touch .conformance/unlock").code, 2);
    assert.equal(shell(p.dir, "ls src && grep -r a src/steps").code, 0);
    assert.equal(shell(p.dir, "cp /tmp/x .kiro/hooks/enforcement.json").code, 2);
  } finally {
    p.cleanup();
  }
});

test("shell parsing finds the written paths", () => {
  assert.deepEqual(shellWriteTargets("cat a > b && tee -a c d < e"), ["b", "c", "d"]);
  assert.deepEqual(shellWriteTargets("mv x y; cp s t; git checkout -- f g"), ["x", "y", "t", "f", "g"]);
  assert.deepEqual(shellWriteTargets("echo hi >>log.txt"), ["log.txt"]);
  assert.deepEqual(shellWriteTargets("grep -r x src | wc -l"), []);
});

test("a broken config allows the call with a warning (exit 1), so the agent is never locked out", () => {
  const p = makeProject({}, (c) => delete c.classes);
  try {
    const r = write(p.dir, "conformance.config.json");
    assert.equal(r.code, 1);
    assert.match(r.err, /allowing the call/);
  } finally {
    p.cleanup();
  }
});

test("the hook is fast enough to run before every write", () => {
  const { p } = repo();
  try {
    write(p.dir, "docs/a.md");
    const r = write(p.dir, "src/steps/db/a.ts");
    assert.ok(r.ms < 1500, `${r.ms}ms`);
  } finally {
    p.cleanup();
  }
});
