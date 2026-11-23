import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runConformance } from "../cli.ts";
import { violation } from "../types.ts";
import { fakeRule, makeProject, perFileRule, repoRoot } from "./helpers.ts";

const src = (n: number): Record<string, string> =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`src/m${String(i).padStart(3, "0")}.ts`, `export const x${i} = ${i};\n`]));

test("violations are sorted by rule, file, line, and two runs give identical output", () => {
  const p = makeProject(src(3));
  try {
    const rules = [perFileRule("R02"), perFileRule("R01")];
    const a = runConformance({ root: p.dir, rules });
    const b = runConformance({ root: p.dir, rules });
    assert.equal(a.output, b.output);
    const keys = a.report.violations.map((v) => `${v.rule} ${v.file}`);
    assert.deepEqual(keys, [...keys].sort());
    assert.equal(a.report.violations[0]?.rule, "R01");
  } finally {
    p.cleanup();
  }
});

test("console output stays within maxChars and points to the full report", () => {
  const p = makeProject(src(150), (c) => ((c.output as Record<string, unknown>).maxChars = 800));
  try {
    const r = runConformance({ root: p.dir, rules: [perFileRule("R01"), perFileRule("R02"), perFileRule("R03")] });
    assert.ok(r.output.length <= 800, `length ${r.output.length}`);
    assert.match(r.output, /Full report: \.conformance\/report\.md/);
    assert.match(r.output, /R01 fake-r01 \(error\): 150/);
    const md = readFileSync(join(p.dir, ".conformance/report.md"), "utf8");
    assert.equal(md.split("\n").filter((l) => l.startsWith("- `src/")).length, 450);
    assert.ok(existsSync(join(p.dir, ".conformance/report.json")));
  } finally {
    p.cleanup();
  }
});

test("exit codes: clean 0, warnings 0 (strict 1), errors 1, crashing rule 2", () => {
  const p = makeProject(src(1));
  try {
    assert.equal(runConformance({ root: p.dir, rules: [] }).exitCode, 0);
    const warn = [perFileRule("R01", "warning")];
    assert.equal(runConformance({ root: p.dir, rules: warn }).exitCode, 0);
    assert.equal(runConformance({ root: p.dir, rules: warn, strict: true }).exitCode, 1);
    assert.equal(runConformance({ root: p.dir, rules: [perFileRule("R01")] }).exitCode, 1);
    const crash = fakeRule("R02", {
      check: () => {
        throw new Error("boom");
      },
    });
    const r = runConformance({ root: p.dir, rules: [perFileRule("R01"), crash] });
    assert.equal(r.exitCode, 2);
    assert.equal(r.report.violations.length, 1, "other rules still report");
    assert.match(r.output, /rule R02 fake-r02 crashed: boom/);
  } finally {
    p.cleanup();
  }
});

test("rules with missing parts are not-applicable, not passed", () => {
  const p = makeProject(src(1));
  try {
    const r = runConformance({ root: p.dir, rules: [fakeRule("R05", { needs: ["steps"], check: () => assert.fail("must not run") })] });
    assert.equal(r.report.rulesRun, 0);
    assert.deepEqual(r.report.notApplicable, [{ rule: "R05", name: "fake-r05", missing: ["steps"] }]);
    assert.match(r.output, /not applicable: R05/);
  } finally {
    p.cleanup();
  }
});

test("exceptions match by target or path glob; unused and malformed ones never hide violations", () => {
  const p = makeProject({
    ...src(3),
    "conformance.exceptions.json": JSON.stringify([
      { rule: "R01", target: "src/m000.ts", reason: "ok", date: "2026-11-23" },
      { rule: "fake-r01", target: "src/m00[12].ts", reason: "glob", date: "2026-11-23" },
      { rule: "R01", target: "nothing.ts", reason: "stale", date: "2026-11-23" },
      { rule: "R02", target: "src/m000.ts", date: "2026-11-23" },
    ]),
  });
  try {
    const seen: number[] = [];
    const post = fakeRule("R30", { phase: "post", check: (ctx) => (seen.push(ctx.exceptions?.unused.length ?? -1), []) });
    const r = runConformance({ root: p.dir, rules: [perFileRule("R01"), perFileRule("R02"), post] });
    assert.equal(r.report.violations.filter((v) => v.rule === "R01").length, 0);
    assert.equal(r.report.violations.filter((v) => v.rule === "R02").length, 3, "malformed entry matched nothing");
    assert.equal(r.report.exceptions.used.length, 2);
    assert.deepEqual(seen, [1]);
  } finally {
    p.cleanup();
  }
});

test("exceptions by target name", () => {
  const p = makeProject({
    "src/a.ts": "export const a = 1;\n",
    "conformance.exceptions.json": JSON.stringify([{ rule: "R13", target: "orders.cancel", reason: "approved", date: "2026-11-23" }]),
  });
  try {
    const rule = fakeRule("R13", { check: (_c, self) => [violation(self, "src/a.ts", 1, "over budget", "orders.cancel")] });
    assert.equal(runConformance({ root: p.dir, rules: [rule] }).exitCode, 0);
  } finally {
    p.cleanup();
  }
});

test("--files limits file-scoped rules only", () => {
  const p = makeProject(src(3));
  try {
    const r = runConformance({
      root: p.dir,
      files: ["src/m001.ts"],
      rules: [perFileRule("R01", "error", "file"), perFileRule("R02", "error", "project")],
    });
    assert.deepEqual(
      r.report.violations.map((v) => `${v.rule} ${v.file}`),
      ["R01 src/m001.ts", "R02 src/m000.ts", "R02 src/m001.ts", "R02 src/m002.ts"],
    );
  } finally {
    p.cleanup();
  }
});

test("discovery reads static manifest fields and resolves strip steps through imports", () => {
  const p = makeProject({
    "src/steps/db/user.findById.ts": [
      `import { defineStep } from "../../lib/step.ts";`,
      `export const findUserById = defineStep({`,
      `  name: "db.user.findById",`,
      `  class: "db",`,
      `  input: UserIdSchema,`,
      `  permissions: { reads: ["users"], writes: [], storage: [] },`,
      `  errors: ["network"],`,
      `});`,
      `declare const UserIdSchema: unknown;`,
    ].join("\n"),
    "src/strips/profile.view.strip.ts": [
      `import { defineStrip } from "../lib/strip.ts";`,
      `import { findUserById } from "../steps/db/user.findById.ts";`,
      `export const viewProfile = defineStrip({ name: "profile.view", steps: [findUserById, missingStep] });`,
      `declare const missingStep: unknown;`,
    ].join("\n"),
    "src/lib/step.ts": "export function defineStep(x: unknown) { return x; }\n",
    "src/lib/strip.ts": "export function defineStrip(x: unknown) { return x; }\n",
  });
  try {
    type Seen = { steps: number; refs: Array<string | null>; perms: unknown; input: unknown };
    const seen: Seen[] = [];
    const probe = fakeRule("R99", {
      check: (ctx) => {
        const s = ctx.steps[0];
        seen.push({
          steps: ctx.steps.length,
          refs: (ctx.strips[0]?.stepRefs ?? []).map((r) => r.step?.name ?? null),
          perms: s?.props.permissions,
          input: s?.props.input,
        });
        return [];
      },
    });
    const r = runConformance({ root: p.dir, rules: [probe] });
    assert.equal(r.exitCode, 0, r.output);
    const got = seen[0];
    assert.ok(got);
    assert.equal(got.steps, 1);
    assert.deepEqual(got.refs, ["db.user.findById", null]);
    assert.deepEqual(got.input, { kind: "expr", text: "UserIdSchema", line: 5 });
    const perms = got.perms as { kind: string; props: Record<string, { kind: string; value: unknown }> };
    assert.equal(perms.kind, "object");
    assert.deepEqual(perms.props.reads?.value, ["users"]);
  } finally {
    p.cleanup();
  }
});

test("a parse error is a script failure (exit 2), never a pass", () => {
  const p = makeProject({ "src/broken.ts": "export const = ;\n" });
  try {
    const r = runConformance({ root: p.dir, rules: [] });
    assert.equal(r.exitCode, 2);
    assert.match(r.output, /parse error: src\/broken\.ts:1/);
  } finally {
    p.cleanup();
  }
});

test("a bad config is a script failure naming the field", () => {
  const p = makeProject({}, (c) => delete c.classes);
  try {
    const r = runConformance({ root: p.dir, rules: [] });
    assert.equal(r.exitCode, 2);
    assert.match(r.output, /conformance\.config\.json: classes: is missing/);
  } finally {
    p.cleanup();
  }
});

test("the CLI exits 2 on an unknown argument and 0 on a clean project", () => {
  const cli = join(repoRoot, "scripts/conformance/cli.ts");
  const bad = spawnSync(process.execPath, [cli, "--bogus"], { encoding: "utf8" });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /unknown argument: --bogus/);
  const p = makeProject(src(1));
  try {
    const ok = spawnSync(process.execPath, [cli, "--root", p.dir], { encoding: "utf8" });
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /conformance: PASSED/);
  } finally {
    p.cleanup();
  }
});
