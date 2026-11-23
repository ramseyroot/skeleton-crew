import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runChecks } from "../check.ts";
import { makeProject } from "./helpers.ts";

const PASS = `node -e "process.exit(0)"`;
const FAIL = `node -e "console.log('1 test failed'); process.exit(1)"`;

type Checks = { typecheck: string | null; test: string | null; testFiles: string | null };
const withChecks = (checks: Checks) => (c: Record<string, unknown>) => {
  c.checks = checks;
};

test("missing commands are reported as not configured, never as passed", () => {
  const p = makeProject({}, withChecks({ typecheck: null, test: null, testFiles: null }));
  try {
    const r = runChecks(p.dir);
    assert.equal(r.exitCode, 0);
    assert.deepEqual(r.steps.map((s) => [s.name, s.status]), [
      ["conformance", "passed"],
      ["typecheck", "not configured"],
      ["tests", "not configured"],
      ["affected strip tests", "skipped"],
    ]);
    assert.match(r.output, /Not configured, so not checked \(this is not a pass\): typecheck, tests/);
  } finally {
    p.cleanup();
  }
});

test("typecheck needs a tsconfig.json; every check runs even after a failure", () => {
  const p = makeProject({ "tsconfig.json": "{}" }, withChecks({ typecheck: FAIL, test: PASS, testFiles: null }));
  try {
    const r = runChecks(p.dir);
    assert.equal(r.exitCode, 1);
    assert.deepEqual(r.steps.map((s) => s.status), ["passed", "failed", "passed", "skipped"]);
    assert.match(r.output, /--- typecheck ---\n1 test failed/);
  } finally {
    p.cleanup();
  }
});

test("affected strip tests from an active committed plan run, and fail when testFiles is not configured", () => {
  const plan = `---\nstatus: active\ncreated: 2999-12-31\nupdated: 2999-12-31\n---\n\n## Affected strip tests\n\n- src/features/demo/strips/a.strip.test.ts\n`;
  const p = makeProject(
    {
      ".kiro/specs/demo/change-plan.md": plan,
      "src/features/demo/strips/a.strip.test.ts": "export {};\n",
      "src/features/demo/index.ts": "export const demoFeature = 1;\n",
      "src/features/demo/feature.json": JSON.stringify({ name: "demo", module: "demoFeature", routes: [] }),
    },
    withChecks({ typecheck: null, test: null, testFiles: null }),
  );
  const g = (...a: string[]) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: p.dir, encoding: "utf8" });
  try {
    g("init", "-q", "-b", "main");
    g("add", "-A");
    g("commit", "-q", "-m", "plan");
    let r = runChecks(p.dir);
    assert.equal(r.exitCode, 1);
    assert.equal(r.steps[0]?.status, "passed", r.output);
    assert.match(r.output, /checks\.testFiles is not configured/);

    p.write("conformance.config.json", JSON.stringify({ ...JSON.parse(readFileSync(join(p.dir, "conformance.config.json"), "utf8")), checks: { typecheck: null, test: null, testFiles: `node -e "console.log(process.argv.slice(1).join(' '))" {files}` } }));
    r = runChecks(p.dir);
    assert.equal(r.exitCode, 0, r.output + JSON.stringify(r.steps, null, 1));
    assert.equal(r.steps[3]?.status, "passed");
    assert.match(r.steps[3]?.output ?? "", /src\/features\/demo\/strips\/a\.strip\.test\.ts/);
  } finally {
    p.cleanup();
  }
});

test("output stays within maxChars", () => {
  const noisy = `node -e "console.log('x'.repeat(20000)); process.exit(1)"`;
  const p = makeProject({ "tsconfig.json": "{}" }, (c) => {
    c.checks = { typecheck: noisy, test: noisy, testFiles: null };
    (c.output as Record<string, unknown>).maxChars = 1500;
  });
  try {
    const r = runChecks(p.dir);
    assert.ok(r.output.length <= 1500, String(r.output.length));
    assert.match(r.output, /tests: FAILED/);
  } finally {
    p.cleanup();
  }
});
