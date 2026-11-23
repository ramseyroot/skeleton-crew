import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeProject, repoRoot } from "./helpers.ts";

const HOOK = join(repoRoot, "scripts/conformance/hooks/stop.ts");

function runHook(cwd: string, session = "s1", args: string[] = []): { code: number | null; out: string } {
  const r = spawnSync(process.execPath, [HOOK, ...args], {
    cwd,
    input: JSON.stringify({ hook_event_name: "Stop", cwd, session_id: session }),
    encoding: "utf8",
  });
  return { code: r.status, out: r.stdout.trim() };
}

const decision = (out: string): { decision?: string; reason?: string } => (out ? JSON.parse(out) : {});

test("clean project: allowed to stop, and an unchanged tree skips the check", () => {
  const marks = mkdtempSync(join(tmpdir(), "marks-"));
  const counter = join(marks, "runs");
  const p = makeProject({ "src/a.ts": "export const a = 1;\n" }, (c) => {
    c.checks = { typecheck: null, test: `node -e "require('fs').appendFileSync('${counter}', 'x')"`, testFiles: null };
  });
  try {
    assert.deepEqual(runHook(p.dir), { code: 0, out: "" });
    assert.deepEqual(runHook(p.dir), { code: 0, out: "" });
    assert.equal(readFileSync(counter, "utf8"), "x", "second run was skipped");
    p.write("src/b.ts", "export const b = 2;\n");
    runHook(p.dir);
    assert.equal(readFileSync(counter, "utf8"), "xx", "a change runs the check again");
  } finally {
    p.cleanup();
    rmSync(marks, { recursive: true, force: true });
  }
});

test("failing checks: block, block, final block, then allow; a pass resets the count", () => {
  const p = makeProject({ "src/a.ts": 'console.log("x");\n' });
  try {
    const r1 = runHook(p.dir);
    assert.equal(r1.code, 0);
    assert.equal(decision(r1.out).decision, "block");
    assert.match(decision(r1.out).reason ?? "", /attempt 1 of 3[\s\S]*R01 no-console/);
    assert.match(decision(runHook(p.dir).out).reason ?? "", /attempt 2 of 3/);
    assert.match(decision(runHook(p.dir).out).reason ?? "", /still fail after 3 attempts\. Stop fixing now/);
    assert.deepEqual(runHook(p.dir), { code: 0, out: "" }, "over the limit the agent may stop");
    assert.equal(decision(runHook(p.dir, "s2").out).decision, "block", "other sessions count separately");

    p.write("src/a.ts", "export const a = 1;\n");
    assert.deepEqual(runHook(p.dir), { code: 0, out: "" });
    p.write("src/a.ts", 'console.log("again");\n');
    assert.match(decision(runHook(p.dir).out).reason ?? "", /attempt 1 of 3/);
  } finally {
    p.cleanup();
  }
});

test("--reset (from the prompt-submit hook) restarts the count", () => {
  const p = makeProject({ "src/a.ts": 'console.log("x");\n' });
  try {
    runHook(p.dir);
    runHook(p.dir);
    assert.deepEqual(runHook(p.dir, "s1", ["--reset"]), { code: 0, out: "" });
    assert.match(decision(runHook(p.dir).out).reason ?? "", /attempt 1 of 3/);
  } finally {
    p.cleanup();
  }
});

test("a broken hook exits 3, so the turn ends instead of looping, and the error is logged", () => {
  const p = makeProject({}, (c) => delete c.classes);
  try {
    const r = runHook(p.dir);
    assert.equal(r.code, 3);
    assert.equal(r.out, "");
    assert.ok(existsSync(join(p.dir, ".conformance/stop-error.log")));
  } finally {
    p.cleanup();
  }
});
