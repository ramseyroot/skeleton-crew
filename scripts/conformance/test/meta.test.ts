// Every rule has fixtures and a docs section, and every docs section has a rule.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { rules } from "../rules/index.ts";
import { docsAnchor, DOCS_FILE } from "../types.ts";
import { repoRoot } from "./helpers.ts";

const FIXTURES = new URL("./fixtures/", import.meta.url).pathname;

const LABELS = ["Severity", "Catches", "Why", "Failing example", "Passing example", "Fix"];

function docSections(): Map<string, string> {
  // Headings inside fenced code blocks (such as the format example) are not sections.
  const text = readFileSync(join(repoRoot, DOCS_FILE), "utf8").replace(/^```[\s\S]*?^```/gm, "");
  const sections = new Map<string, string>();
  const parts = text.split(/^## /m).slice(1);
  for (const part of parts) {
    const heading = part.split("\n", 1)[0] ?? "";
    const m = /^(R\d{2}) ([a-z0-9-]+)$/.exec(heading.trim());
    if (m) sections.set(`${m[1]} ${m[2]}`, part);
  }
  return sections;
}

test("rule IDs are unique, well formed, and listed in ID order", () => {
  const ids = rules.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate rule ID");
  for (const r of rules) {
    assert.match(r.id, /^R\d{2}$/);
    assert.match(r.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  }
  assert.deepEqual(ids, [...ids].sort());
});

test("every rule has bad and good fixtures, and the bad one has expected.json", () => {
  for (const r of rules) {
    for (const kind of ["bad", "good"]) {
      assert.ok(existsSync(join(FIXTURES, r.id, kind)), `missing fixtures/${r.id}/${kind}`);
    }
    assert.ok(existsSync(join(FIXTURES, r.id, "bad", "expected.json")), `missing fixtures/${r.id}/bad/expected.json`);
  }
});

test("every fixture folder belongs to a registered rule", () => {
  if (!existsSync(FIXTURES)) return;
  const ids = new Set(rules.map((r) => r.id));
  for (const entry of readdirSync(FIXTURES, { withFileTypes: true })) {
    if (entry.isDirectory()) assert.ok(ids.has(entry.name), `fixtures/${entry.name} has no rule`);
  }
});

test("every rule has a docs section with all labels, and the anchor matches", () => {
  const sections = docSections();
  for (const r of rules) {
    const body = sections.get(`${r.id} ${r.name}`);
    assert.ok(body, `${DOCS_FILE} has no section "## ${r.id} ${r.name}"`);
    for (const label of LABELS) assert.ok(body.includes(`**${label}:**`), `${r.id} section lacks **${label}:**`);
    assert.ok(body.includes(`**Severity:** ${r.severity}`), `${r.id} severity in docs differs from the rule`);
    assert.equal(docsAnchor(r), `${r.id.toLowerCase()}-${r.name}`);
  }
});

test("every docs section belongs to a registered rule", () => {
  const registered = new Set(rules.map((r) => `${r.id} ${r.name}`));
  for (const key of docSections().keys()) assert.ok(registered.has(key), `${DOCS_FILE} section "${key}" has no rule`);
});
