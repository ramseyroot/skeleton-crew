import assert from "node:assert/strict";
import { test } from "node:test";
import { displayText, toPublicResult, viewStateOf } from "../../src/components/view-state.ts";
import { errResult, okResult } from "../../src/test-utils/fixtures.ts";

test("a successful result is ready, or empty when the caller says so", () => {
  assert.deepEqual(viewStateOf(okResult({ n: 1 })), { status: "ready", value: { n: 1 } });
  assert.deepEqual(viewStateOf(okResult([] as number[]), (v) => v.length === 0), { status: "empty" });
});

test("a user error becomes a toast message", () => {
  const r = errResult("conflict", "user", { userMessage: "Name taken" });
  assert.equal(r.ok, false);
  const state = viewStateOf(r);
  assert.deepEqual(state, { status: "error", display: { type: "toast", message: "Name taken" }, stripId: "strip-demo" });
  assert.equal(state.status === "error" && displayText(state.display), "Name taken");
});

test("an internal error shows a generic message with the reference and never its own text", () => {
  const r = errResult("unexpected", "internal", { stripId: "strip-7f3a" });
  assert.equal(r.ok === false && r.error.audience, "internal");
  const state = viewStateOf(r);
  assert.equal(state.status === "error" && state.display.type, "generic");
  const text = state.status === "error" ? displayText(state.display) : "";
  assert.match(text, /Reference: strip-7f3a$/);
  assert.equal(text.includes("fixture"), false);
});

test("fixtures build the same shapes the runner returns", () => {
  const ok = okResult("v", "s-1");
  assert.deepEqual(ok, { ok: true, value: "v", stripId: "s-1" });
  const bad = errResult("not_found", "internal", { stripId: "s-2" });
  assert.equal(bad.ok === false && bad.error.stripId, "s-2");
  assert.equal(bad.ok === false && bad.error.kind, "not_found");
});

test("the public result carries no StepError, so internal text cannot reach the browser", () => {
  const internal = toPublicResult(errResult("unexpected", "internal", { stripId: "s-9" }));
  assert.deepEqual(internal, { ok: false, display: { type: "generic", reference: "s-9" }, stripId: "s-9" });
  assert.equal(JSON.stringify(internal).includes("fixture"), false);
  assert.equal("error" in internal, false);
  assert.deepEqual(toPublicResult(okResult(5, "s-1")), { ok: true, value: 5, stripId: "s-1" });
});
