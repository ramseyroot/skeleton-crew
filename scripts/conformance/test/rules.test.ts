// Runs every registered rule against its bad and good fixtures.
//
// Layout per rule: fixtures/<ID>/bad/ and fixtures/<ID>/good/, each a small project.
// - bad/expected.json lists the violations the rule must report: [{ "file": "...", "line": 3, "target"?: "..." }].
// - A fixture may hold config.patch.json, deep-merged onto the repository config.
// - A fixture may hold its own conformance.config.json, used as is.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runConformance } from "../cli.ts";
import { CONFIG_FILE } from "../config.ts";
import { rules } from "../rules/index.ts";
import { repoConfig } from "./helpers.ts";

const FIXTURES = new URL("./fixtures/", import.meta.url).pathname;

type Expected = { file: string; line: number; target?: string };

function merge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    const b = out[k];
    out[k] =
      typeof v === "object" && v !== null && !Array.isArray(v) && typeof b === "object" && b !== null && !Array.isArray(b)
        ? merge(b as Record<string, unknown>, v as Record<string, unknown>)
        : v;
  }
  return out;
}

/** Copies a fixture to a temporary folder with a config, so tests never write into the repository. */
function stageFixture(id: string, kind: "bad" | "good"): { dir: string; expected: Expected[]; cleanup(): void } {
  const src = join(FIXTURES, id, kind);
  const dir = mkdtempSync(join(tmpdir(), `fixture-${id}-${kind}-`));
  cpSync(src, dir, { recursive: true });
  if (!existsSync(join(dir, CONFIG_FILE))) {
    const patchFile = join(dir, "config.patch.json");
    const patch = existsSync(patchFile) ? (JSON.parse(readFileSync(patchFile, "utf8")) as Record<string, unknown>) : {};
    writeFileSync(join(dir, CONFIG_FILE), JSON.stringify(merge(repoConfig(), patch), null, 2));
  }
  const expFile = join(dir, "expected.json");
  const expected = existsSync(expFile) ? (JSON.parse(readFileSync(expFile, "utf8")) as Expected[]) : [];
  return { dir, expected, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

for (const rule of rules) {
  test(`${rule.id} ${rule.name}: bad fixture reports the expected violations`, () => {
    const f = stageFixture(rule.id, "bad");
    try {
      const r = runConformance({ root: f.dir, rules: [rule], writeReport: false });
      assert.equal(r.report.scriptErrors.length, 0, r.output);
      assert.equal(r.report.notApplicable.length, 0, `rule was not applicable: ${r.output}`);
      const got = r.report.violations
        .filter((v) => v.rule === rule.id)
        .map((v) => (f.expected.some((e) => e.target !== undefined) ? { file: v.file, line: v.line, target: v.target } : { file: v.file, line: v.line }));
      const want = f.expected.map((e) => (e.target !== undefined ? e : { file: e.file, line: e.line }));
      assert.ok(want.length > 0, "expected.json must list at least one violation");
      assert.deepEqual(got, want);
    } finally {
      f.cleanup();
    }
  });

  test(`${rule.id} ${rule.name}: good fixture reports nothing for this rule`, () => {
    const f = stageFixture(rule.id, "good");
    try {
      const r = runConformance({ root: f.dir, rules: [rule], writeReport: false });
      assert.equal(r.report.scriptErrors.length, 0, r.output);
      assert.equal(r.report.notApplicable.length, 0, `rule was not applicable: ${r.output}`);
      assert.deepEqual(r.report.violations.filter((v) => v.rule === rule.id), []);
    } finally {
      f.cleanup();
    }
  });
}
