import assert from "node:assert/strict";
import { test } from "node:test";
import { createFixedClock } from "../../clock/fixed/index.ts";
import { createSequenceIds } from "../../ids/sequence/index.ts";
import { runAuthContract } from "../contract.test.ts";
import { errorMap } from "./errors.ts";
import { createMemoryAuth } from "./index.ts";

runAuthContract("auth/memory", () => {
  const clock = createFixedClock();
  return { auth: createMemoryAuth({ clock, ids: createSequenceIds() }), clock };
});

test("auth/memory: sessionTtlMs shortens the session", async () => {
  const clock = createFixedClock();
  const auth = createMemoryAuth({ clock, ids: createSequenceIds(), sessionTtlMs: 1000 });
  const acc = await auth.createAccount({ email: "ada@example.com", password: "correct horse battery" });
  assert.ok(acc.ok);
  if (!acc.ok) return;
  const s = await auth.createSession(acc.value.id);
  assert.ok(s.ok);
  if (!s.ok) return;
  clock.advance(999);
  assert.equal((await auth.verifySession(s.value.token)).ok, true);
  clock.advance(1);
  assert.equal((await auth.verifySession(s.value.token)).ok, false);
});

test("auth/memory: unmapped failures are unexpected", () => {
  assert.equal(errorMap.map(new Error("x")), "unexpected");
});
