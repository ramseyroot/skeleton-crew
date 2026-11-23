import assert from "node:assert/strict";
import { test } from "node:test";
import { err, fromThrown, isTypedError, makeError, ok, typedError } from "./result.ts";

test("ok and err build the two shapes", () => {
  assert.deepEqual(ok(3), { ok: true, value: 3 });
  const e = makeError("not_found", "db.a.b", "s1", "gone");
  assert.deepEqual(err(e), { ok: false, error: e });
});

test("audience defaults to internal and has no userMessage", () => {
  const e = makeError("conflict", "db.a.b", "s1", "dup");
  assert.equal(e.audience, "internal");
  assert.equal(e.userMessage, undefined);
  assert.equal(e.retryable, false);
});

test("a user error carries its userMessage", () => {
  const e = makeError("validation", "pure.a.b", "s1", "bad", { audience: "user", userMessage: "Name too long" });
  assert.equal(e.audience, "user");
  assert.equal(e.userMessage, "Name too long");
});

test("a StepError survives a JSON round trip, and cause is dropped", () => {
  const e = makeError("network", "api.a.b", "s1", "timeout", { retryable: true, cause: new Error("socket") });
  const back = JSON.parse(JSON.stringify(e)) as Record<string, unknown>;
  assert.equal(e.cause instanceof Error, true, "cause stays readable in memory");
  assert.equal("cause" in back, false);
  assert.deepEqual(back, {
    kind: "network",
    step: "api.a.b",
    stripId: "s1",
    message: "timeout",
    retryable: true,
    audience: "internal",
  });
});

test("an Error with a cause still serializes to a plain object", () => {
  const e = fromThrown(new Error("boom"), "db.a.b", "s1");
  assert.doesNotThrow(() => JSON.stringify(e));
  const back = JSON.parse(JSON.stringify(e)) as { cause?: unknown };
  assert.equal(back.cause, undefined);
});

test("fromThrown makes an unexpected internal error and never fills userMessage", () => {
  for (const thrown of [new Error("secret db password"), "a string", 42, null, undefined, { a: 1 }]) {
    const e = fromThrown(thrown, "db.a.b", "s1");
    assert.equal(e.kind, "unexpected");
    assert.equal(e.audience, "internal");
    assert.equal(e.userMessage, undefined);
    assert.equal(e.step, "db.a.b");
    assert.equal(e.stripId, "s1");
  }
  assert.equal(fromThrown(new Error("secret"), "a.b.c", "s").message, "secret");
});

test("fromThrown handles a value that cannot be serialized", () => {
  const loop: Record<string, unknown> = {};
  loop.self = loop;
  const e = fromThrown(loop, "a.b.c", "s");
  assert.equal(e.kind, "unexpected");
  assert.equal(e.message, "unserializable thrown value");
});

test("a typed error keeps its kind, retryable flag and user audience", () => {
  const t = typedError("rate_limited", "slow down", { retryable: true });
  assert.equal(isTypedError(t), true);
  const e = fromThrown(t, "api.a.b", "s1");
  assert.equal(e.kind, "rate_limited");
  assert.equal(e.retryable, true);
  assert.equal(e.audience, "internal");

  const u = fromThrown(
    typedError("validation", "bad name", { audience: "user", userMessage: "Pick a shorter name" }),
    "pure.a.b",
    "s1",
  );
  assert.equal(u.audience, "user");
  assert.equal(u.userMessage, "Pick a shorter name");
});

test("a typed user error with an empty userMessage is downgraded to internal", () => {
  const bad = { ...typedError("validation", "x"), audience: "user" as const, userMessage: "" };
  const e = fromThrown(bad, "a.b.c", "s");
  assert.equal(e.audience, "internal");
  assert.equal(e.userMessage, undefined);
});

test("isTypedError rejects look-alikes", () => {
  assert.equal(isTypedError({ kind: "validation" }), false);
  assert.equal(isTypedError(new Error("x")), false);
  assert.equal(isTypedError(null), false);
});
