import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONFIG_FILE, ConfigError, loadConfig, parseConfig } from "../config.ts";

const repoRoot = new URL("../../../", import.meta.url).pathname;
const valid = (): Record<string, unknown> => JSON.parse(readFileSync(join(repoRoot, CONFIG_FILE), "utf8"));

function fieldOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof ConfigError, `expected ConfigError, got ${String(e)}`);
    return e.field;
  }
  assert.fail("expected an error");
}

test("the repository config is valid", () => {
  const cfg = loadConfig(repoRoot);
  assert.equal(cfg.output.maxChars, 3000);
});

test("each missing top-level field is named", () => {
  for (const key of Object.keys(valid())) {
    const raw = valid();
    delete raw[key];
    assert.equal(fieldOf(() => parseConfig(raw)), key);
  }
});

test("a missing nested field is named with its path", () => {
  const raw = valid();
  delete (raw.output as Record<string, unknown>).maxChars;
  assert.equal(fieldOf(() => parseConfig(raw)), "output.maxChars");
});

test("unknown fields are rejected at top level and nested", () => {
  const top = valid();
  top.sourceRoot = ["src"];
  assert.equal(fieldOf(() => parseConfig(top)), "sourceRoot");
  const nested = valid();
  (nested.checks as Record<string, unknown>).tests = "x";
  assert.equal(fieldOf(() => parseConfig(nested)), "checks.tests");
});

test("wrong types are rejected", () => {
  const cases: Array<[string, (r: Record<string, unknown>) => void]> = [
    ["classes", (r) => (r.classes = "pure")],
    ["output.maxChars", (r) => ((r.output as Record<string, unknown>).maxChars = 0)],
    ["stopHook.skipIfUnchanged", (r) => ((r.stopHook as Record<string, unknown>).skipIfUnchanged = "yes")],
    ["checks.test", (r) => ((r.checks as Record<string, unknown>).test = "")],
    ["specsFolder", (r) => (r.specsFolder = "")],
  ];
  for (const [field, mutate] of cases) {
    const raw = valid();
    mutate(raw);
    assert.equal(fieldOf(() => parseConfig(raw)), field);
  }
});

test("null is allowed for optional check commands", () => {
  const raw = valid();
  (raw.checks as Record<string, unknown>).typecheck = null;
  assert.equal(parseConfig(raw).checks.typecheck, null);
});

test("a missing or malformed file is reported", () => {
  const dir = mkdtempSync(join(tmpdir(), "conf-"));
  try {
    assert.equal(fieldOf(() => loadConfig(dir)), "(file)");
    writeFileSync(join(dir, CONFIG_FILE), "{ not json");
    assert.equal(fieldOf(() => loadConfig(dir)), "(file)");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
