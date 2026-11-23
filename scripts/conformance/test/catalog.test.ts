import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runConformance } from "../cli.ts";
import { buildCatalog, CATALOG_JSON, CATALOG_MD, catalogMd, MAX_LINE, parseCatalog } from "../catalog.ts";
import { fakeRule, makeProject } from "./helpers.ts";
import type { Context } from "../types.ts";

const DS = "declare function defineStep(x: unknown): unknown;\n";
const DT = "declare function defineStrip(x: unknown): unknown;\n";

const files = {
  "src/features/demo/steps/db/user.save.ts":
    `export const saveUser = defineStep({ name: "db.user.save", class: "db", input: User, output: User, permissions: { reads: [], writes: ["users"], storage: [] }, errors: ["conflict", "network"] });\ndeclare const User: unknown;\n` + DS,
  "src/features/demo/steps/db/user.find.ts":
    `export const findUser = defineStep({ name: "db.user.find", class: "db", input: z.object({\n  id: z.string(),\n}), output: User, permissions: { reads: ["users"], writes: [], storage: [] }, errors: ["network"] });\ndeclare const User: unknown;\ndeclare const z: any;\n` + DS,
  "src/features/demo/strips/profile.save.strip.ts":
    `import { findUser } from "../steps/db/user.find.ts";\nimport { saveUser } from "../steps/db/user.save.ts";\nexport const s = defineStrip({ name: "profile.save", steps: [findUser, saveUser], budget: { reads: ["users"], writes: ["users"], storage: [] } });\n` + DT,
};

function ctxOf(dir: string): Pick<Context, "steps" | "strips" | "config"> {
  let captured: Pick<Context, "steps" | "strips" | "config"> | null = null;
  runConformance({ root: dir, writeReport: false, rules: [fakeRule("R99", { check: (c) => ((captured = c), []) })] });
  assert.ok(captured);
  return captured;
}

test("catalog lists steps and strips by name with used-by, permissions, and one-line schemas", () => {
  const p = makeProject(files);
  try {
    const c = buildCatalog(ctxOf(p.dir));
    assert.deepEqual(c.steps.map((s) => s.name), ["db.user.find", "db.user.save"]);
    assert.deepEqual(c.steps[0]?.usedBy, ["profile.save"]);
    assert.equal(c.steps[0]?.input, "z.object({ id: z.string(), })");
    assert.deepEqual(c.steps[1]?.errors, ["conflict", "network"]);
    assert.deepEqual(c.strips[0]?.steps, ["db.user.find", "db.user.save"]);
  } finally {
    p.cleanup();
  }
});

test("--write-catalog writes both files, output is stable, and lines stay within the limit", () => {
  const p = makeProject(files);
  try {
    runConformance({ root: p.dir, writeCatalog: true, writeReport: false });
    const md1 = readFileSync(join(p.dir, CATALOG_MD), "utf8");
    const json1 = readFileSync(join(p.dir, CATALOG_JSON), "utf8");
    runConformance({ root: p.dir, writeCatalog: true, writeReport: false });
    assert.equal(readFileSync(join(p.dir, CATALOG_MD), "utf8"), md1);
    assert.equal(readFileSync(join(p.dir, CATALOG_JSON), "utf8"), json1);
    assert.ok(parseCatalog(json1));
    for (const line of md1.split("\n")) assert.ok(line.length <= MAX_LINE, line);
  } finally {
    p.cleanup();
  }
});

test("long catalog lines are cut to the limit", () => {
  const long = "x".repeat(300);
  const md = catalogMd({
    version: 1,
    steps: [{ name: "db.a.b", class: "db", feature: "demo", file: "f", input: long, output: null, permissions: null, errors: null, usedBy: [] }],
    strips: [],
  });
  for (const line of md.split("\n")) assert.ok(line.length <= MAX_LINE);
  assert.match(md, /\.\.\.$/m);
});
