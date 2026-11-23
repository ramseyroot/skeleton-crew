import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { covers, overlaps, parseTasks } from "../tasks.ts";
import { repoRoot } from "./helpers.ts";

test("parses ids, done state, mode, and Writes lists", () => {
  const tasks = parseTasks(
    [
      "# Tasks",
      "",
      "- [x] 1. Setup",
      "  - Mode: sequential",
      "  - Writes: package.json, `tsconfig.json`",
      "",
      "- [ ] 2. Fixtures",
      "  - Writes: scripts/conformance/test/fixtures/R01/**",
      "  - Some detail",
      "",
      "- [ ] 3. No writes",
      "Plain paragraph after the list.",
      "  - Writes: not/attached.ts",
    ].join("\n"),
  );
  assert.deepEqual(
    tasks.map((t) => [t.id, t.done, t.sequential, t.writes, t.line]),
    [
      ["1", true, true, ["package.json", "tsconfig.json"], 3],
      ["2", false, false, ["scripts/conformance/test/fixtures/R01/**"], 7],
      ["3", false, false, null, 11],
    ],
  );
});

test("this spec's tasks.md parses: every task has Writes and is sequential", () => {
  const tasks = parseTasks(readFileSync(join(repoRoot, ".kiro/specs/enforcement-setup/tasks.md"), "utf8"));
  assert.equal(tasks.length, 23);
  for (const t of tasks) {
    assert.ok(t.writes && t.writes.length > 0, `task ${t.id} has no Writes`);
    assert.ok(t.sequential, `task ${t.id} is not sequential`);
  }
});

test("overlap and coverage of Writes entries", () => {
  assert.ok(overlaps("a/b.ts", "a/b.ts"));
  assert.ok(!overlaps("a/b.ts", "a/c.ts"));
  assert.ok(overlaps("a/**", "a/b/c.ts"));
  assert.ok(overlaps("a/b/c.ts", "a/**"));
  assert.ok(overlaps("a/**", "a/b/**"));
  assert.ok(!overlaps("a/**", "ab/**"));
  assert.ok(covers("src/steps/db/**", "src/steps/db/x/y.ts"));
  assert.ok(!covers("src/steps/db/a.ts", "src/steps/db/b.ts"));
});
