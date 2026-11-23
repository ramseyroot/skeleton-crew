import assert from "node:assert/strict";
import { test } from "node:test";
import { createErrorMap } from "./error-map.ts";

const map = createErrorMap([
  { name: "dup", when: (e) => e instanceof Error && e.message.includes("UNIQUE"), kind: "conflict" },
  { name: "timeout", when: (e) => e instanceof Error && e.name === "TimeoutError", kind: "network" },
]);

test("the first matching rule wins", () => {
  assert.equal(map.map(new Error("UNIQUE constraint failed")), "conflict");
  const t = new Error("x");
  t.name = "TimeoutError";
  assert.equal(map.map(t), "network");
});

test("unmatched failures map to the fallback", () => {
  assert.equal(map.map(new Error("other")), "unexpected");
  assert.equal(createErrorMap([], "upstream").map("x"), "upstream");
});

test("a rule that throws counts as no match", () => {
  const m = createErrorMap([{ name: "bad", when: () => { throw new Error("boom"); }, kind: "conflict" }]);
  assert.equal(m.map(1), "unexpected");
});
