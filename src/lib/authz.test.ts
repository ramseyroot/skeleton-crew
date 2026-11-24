import assert from "node:assert/strict";
import { test } from "node:test";
import { requireOwner, requireRole, requireSignedIn } from "./authz.ts";
import type { Principal } from "./principal.ts";

const where = { step: "db.keys.revoke", stripId: "s1" };
const user: Principal = { kind: "user", accountId: "a1", role: "user" };
const admin: Principal = { kind: "user", accountId: "a9", role: "admin" };
const key: Principal = { kind: "key", accountId: "a1", keyId: "k1", role: "user" };
const anon: Principal = { kind: "anonymous", ip: "1.2.3.4" };

test("an anonymous principal is unauthorized with a written message", () => {
  const r = requireSignedIn(anon, where);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.error.kind, "unauthorized");
    assert.equal(r.error.audience, "user");
    assert.match(r.error.userMessage ?? "", /sign in/);
    assert.equal(r.error.step, "db.keys.revoke");
  }
  assert.equal(requireSignedIn(user, where).ok, true);
  assert.equal(requireSignedIn(key, where).ok, true);
});

test("the owner, a key of the owner, and an admin pass the ownership check", () => {
  assert.equal(requireOwner(user, "a1", where).ok, true);
  assert.equal(requireOwner(key, "a1", where).ok, true);
  assert.equal(requireOwner(admin, "a1", where).ok, true);
});

test("someone else is forbidden, and the message does not name the owner", () => {
  const r = requireOwner(user, "a2", where);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.error.kind, "forbidden");
    assert.equal(r.error.audience, "user");
    assert.equal(JSON.stringify(r.error.userMessage).includes("a2"), false);
  }
  const anonymous = requireOwner(anon, "a1", where);
  assert.equal(anonymous.ok === false && anonymous.error.kind, "unauthorized");
});

test("a role check separates people from plans", () => {
  assert.equal(requireRole(admin, "admin", where).ok, true);
  const r = requireRole(user, "admin", where);
  assert.equal(r.ok === false && r.error.kind, "forbidden");
  assert.equal(requireRole(anon, "admin", where).ok, false);
});
