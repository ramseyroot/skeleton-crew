// Contract suite for the Auth port. Each adapter's test file calls runAuthContract with a factory.
// Tests share accounts inside a case because scrypt takes about 50 to 100 ms per hash.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Auth } from "../../ports/auth.ts";
import { validateCredentials } from "../../ports/auth.ts";
import type { FixedClock } from "../clock/fixed/index.ts";

export type AuthHarness = { auth: Auth; clock: FixedClock };
export type MakeAuth = () => AuthHarness;

const PASSWORD = "correct horse battery";
const DAY = 24 * 60 * 60 * 1000;

export function runAuthContract(name: string, make: MakeAuth): void {
  test(`${name}: validateCredentials checks email and password shape`, () => {
    assert.deepEqual(validateCredentials("ada@example.com", PASSWORD), { ok: true });
    for (const bad of ["", "ada", "ada@", "@example.com", "ada@example", "a b@example.com", "a@@b.com", "a@b.", `${"a".repeat(250)}@b.com`]) {
      assert.deepEqual(validateCredentials(bad, PASSWORD), { ok: false, userMessage: "Enter a valid email address." }, bad);
    }
    assert.deepEqual(validateCredentials("ada@example.com", "123456789"), {
      ok: false,
      userMessage: "Use at least 10 characters for your password.",
    });
    assert.equal(validateCredentials("ada@example.com", "x".repeat(200)).ok, true);
    assert.equal(validateCredentials("ada@example.com", "x".repeat(201)).ok, false);
  });

  test(`${name}: createAccount validates, lowercases, defaults the role and rejects duplicates`, async () => {
    const { auth, clock } = make();
    const bad = await auth.createAccount({ email: "not-an-email", password: PASSWORD });
    assert.equal(bad.ok, false);
    if (!bad.ok) {
      assert.equal(bad.error.kind, "validation");
      assert.equal(bad.error.audience, "user");
      assert.equal(bad.error.userMessage, "Enter a valid email address.");
      assert.match(bad.error.step, /^adapter:auth\//);
    }
    const weak = await auth.createAccount({ email: "ada@example.com", password: "short" });
    assert.equal(weak.ok, false);
    if (!weak.ok) {
      assert.equal(weak.error.kind, "validation");
      assert.equal(weak.error.userMessage, "Use at least 10 characters for your password.");
      assert.doesNotMatch(JSON.stringify(weak.error), /short/);
    }

    const made = await auth.createAccount({ email: "Ada@Example.COM", password: PASSWORD });
    assert.equal(made.ok, true);
    if (!made.ok) return;
    assert.equal(made.value.email, "ada@example.com");
    assert.equal(made.value.role, "user");
    assert.equal(made.value.createdAt, clock.now());
    assert.deepEqual(Object.keys(made.value).sort(), ["createdAt", "email", "id", "role"]);
    assert.doesNotMatch(JSON.stringify(made), new RegExp(PASSWORD));

    const dup = await auth.createAccount({ email: "ADA@example.com", password: "another long password" });
    assert.equal(dup.ok, false);
    if (!dup.ok) {
      assert.equal(dup.error.kind, "conflict");
      assert.equal(dup.error.audience, "user");
      assert.equal(dup.error.userMessage, "An account with that email already exists.");
      assert.doesNotMatch(JSON.stringify(dup.error), /another long password/);
    }

    const admin = await auth.createAccount({ email: "root@example.com", password: PASSWORD, role: "admin" });
    assert.equal(admin.ok && admin.value.role, "admin");
    const got = await auth.getAccount(made.value.id);
    assert.deepEqual(got, { ok: true, value: made.value });
    const missing = await auth.getAccount("nope");
    assert.equal(missing.ok === false && missing.error.kind, "not_found");
  });

  test(`${name}: verifyPassword accepts the password and gives one identical error for wrong password and unknown email`, async () => {
    const { auth } = make();
    const made = await auth.createAccount({ email: "ada@example.com", password: PASSWORD });
    assert.equal(made.ok, true);
    if (!made.ok) return;
    assert.deepEqual(await auth.verifyPassword("ADA@example.com", PASSWORD), { ok: true, value: made.value });

    const wrong = await auth.verifyPassword("ada@example.com", "wrong password here");
    const unknown = await auth.verifyPassword("nobody@example.com", PASSWORD);
    assert.equal(wrong.ok, false);
    assert.equal(unknown.ok, false);
    if (wrong.ok || unknown.ok) return;
    assert.equal(wrong.error.kind, "unauthorized");
    assert.equal(wrong.error.audience, "user");
    assert.equal(wrong.error.userMessage, "Email or password is wrong.");
    assert.deepEqual(wrong.error, unknown.error);
    assert.doesNotMatch(JSON.stringify([wrong, unknown]), /wrong password here|correct horse/);
  });

  test(`${name}: sessions are created, verified, expire after 7 days and end`, async () => {
    const { auth, clock } = make();
    const a = await auth.createAccount({ email: "ada@example.com", password: PASSWORD });
    const b = await auth.createAccount({ email: "bob@example.com", password: PASSWORD });
    assert.ok(a.ok && b.ok);
    if (!a.ok || !b.ok) return;

    const none = await auth.createSession("missing");
    assert.equal(none.ok === false && none.error.kind, "not_found");

    const start = Date.parse(clock.now());
    const s1 = await auth.createSession(a.value.id);
    assert.ok(s1.ok);
    if (!s1.ok) return;
    assert.match(s1.value.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(s1.value.expiresAt, new Date(start + 7 * DAY).toISOString());
    assert.deepEqual(await auth.verifySession(s1.value.token), { ok: true, value: a.value });

    const s2 = await auth.createSession(a.value.id);
    const s3 = await auth.createSession(b.value.id);
    assert.ok(s2.ok && s3.ok);
    if (!s2.ok || !s3.ok) return;
    assert.notEqual(s1.value.token, s2.value.token);

    // Unknown token.
    const unk = await auth.verifySession("not-a-token");
    assert.equal(unk.ok, false);
    if (!unk.ok) {
      assert.equal(unk.error.kind, "unauthorized");
      assert.equal(unk.error.audience, "user");
      assert.equal(unk.error.userMessage, "Please sign in again.");
    }

    // End one, ending an unknown token is fine.
    assert.deepEqual(await auth.endSession(s1.value.token), { ok: true, value: undefined });
    assert.deepEqual(await auth.endSession(s1.value.token), { ok: true, value: undefined });
    assert.deepEqual(await auth.endSession("never-existed"), { ok: true, value: undefined });
    const ended = await auth.verifySession(s1.value.token);
    assert.equal(ended.ok === false && ended.error.userMessage, "Please sign in again.");
    assert.equal((await auth.verifySession(s2.value.token)).ok, true);

    // End all for one account leaves the other account alone.
    const s4 = await auth.createSession(a.value.id);
    assert.ok(s4.ok);
    assert.deepEqual(await auth.endAllSessions(a.value.id), { ok: true, value: undefined });
    assert.equal((await auth.verifySession(s2.value.token)).ok, false);
    if (s4.ok) assert.equal((await auth.verifySession(s4.value.token)).ok, false);
    assert.equal((await auth.verifySession(s3.value.token)).ok, true);
    assert.deepEqual(await auth.endAllSessions("missing"), { ok: true, value: undefined });

    // Expiry: valid just before 7 days, gone at 7 days, and it stays gone.
    clock.advance(7 * DAY - 1);
    assert.equal((await auth.verifySession(s3.value.token)).ok, true);
    clock.advance(1);
    const expired = await auth.verifySession(s3.value.token);
    assert.equal(expired.ok, false);
    if (!expired.ok) {
      assert.equal(expired.error.kind, "unauthorized");
      assert.equal(expired.error.userMessage, "Please sign in again.");
    }
    assert.equal((await auth.verifySession(s3.value.token)).ok, false);
  });

  test(`${name}: no result contains the password or a stored secret beyond the token returned once`, async () => {
    const { auth } = make();
    const made = await auth.createAccount({ email: "ada@example.com", password: PASSWORD });
    assert.ok(made.ok);
    if (!made.ok) return;
    const session = await auth.createSession(made.value.id);
    assert.ok(session.ok);
    if (!session.ok) return;
    const token = session.value.token;
    const outputs = [
      made,
      await auth.verifyPassword("ada@example.com", PASSWORD),
      await auth.verifyPassword("ada@example.com", "wrong password here"),
      await auth.getAccount(made.value.id),
      await auth.verifySession(token),
      await auth.verifySession(`${token}x`),
      await auth.endSession(token),
      await auth.verifySession(token),
    ];
    const text = JSON.stringify(outputs);
    assert.doesNotMatch(text, new RegExp(PASSWORD));
    assert.doesNotMatch(text, /scrypt/);
    assert.equal(text.includes(token), false);
  });
}
