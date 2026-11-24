import assert from "node:assert/strict";
import { test } from "node:test";
import { runStrip } from "../../../lib/strip.ts";
import { AUTH_CASES, makeTestPorts } from "../testing.ts";
import type { AuthCase } from "../testing.ts";
import { DEMO_ACCOUNT } from "../domain.ts";
import { login } from "./accounts.login.strip.ts";
import { logout } from "./accounts.logout.strip.ts";
import { me } from "./accounts.me.strip.ts";
import { signup } from "./accounts.signup.strip.ts";
import { start } from "./accounts.start.strip.ts";
import { whoami } from "./accounts.whoami.strip.ts";

function matrix(name: string, body: (c: AuthCase) => Promise<void>) {
  for (const c of AUTH_CASES) test(`accounts strips [${c.name}]: ${name}`, () => body(c));
}

const setup = (c: AuthCase) => makeTestPorts({ auth: c.auth, database: c.database });
const PASSWORD = "a-fresh-password-1";

matrix("signup creates an account that can then log in, and nothing secret comes back", async (c) => {
  const { ports, cleanup } = await setup(c);
  try {
    const created = await runStrip(signup, ports, { email: " New@Example.com ", password: PASSWORD });
    assert.equal(created.ok, true);
    if (created.ok) {
      assert.equal(created.value.email, "new@example.com");
      assert.equal(created.value.role, "user");
      assert.equal(JSON.stringify(created.value).includes(PASSWORD), false);
      assert.equal("passwordHash" in created.value, false);
    }
    const loggedIn = await runStrip(login, ports, { email: "new@example.com", password: PASSWORD });
    assert.equal(loggedIn.ok, true);
  } finally {
    cleanup();
  }
});

matrix("signup with the demo email is a toast the user can fix", async (c) => {
  const { ports, cleanup } = await setup(c);
  try {
    const r = await runStrip(signup, ports, { email: DEMO_ACCOUNT.email.toUpperCase(), password: PASSWORD });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error.kind, "conflict");
      assert.deepEqual(r.display, { type: "toast", message: "An account with that email already exists." });
    }
  } finally {
    cleanup();
  }
});

matrix("signup with a short password is a toast", async (c) => {
  const { ports, cleanup } = await setup(c);
  try {
    const r = await runStrip(signup, ports, { email: "a@example.com", password: "short" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.deepEqual(r.display, { type: "toast", message: "Use at least 10 characters for your password." });
  } finally {
    cleanup();
  }
});

matrix("login with the demo account works, and a wrong password or unknown email show the same toast", async (c) => {
  const { ports, cleanup } = await setup(c);
  try {
    const good = await runStrip(login, ports, { email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password });
    assert.equal(good.ok, true);
    const wrong = await runStrip(login, ports, { email: DEMO_ACCOUNT.email, password: "not the password" });
    const unknown = await runStrip(login, ports, { email: "nobody@example.com", password: "not the password" });
    assert.equal(wrong.ok, false);
    assert.equal(unknown.ok, false);
    if (!wrong.ok && !unknown.ok) {
      assert.deepEqual(wrong.display, { type: "toast", message: "Email or password is wrong." });
      assert.deepEqual(unknown.display, wrong.display);
    }
  } finally {
    cleanup();
  }
});

matrix("an empty login form is a toast", async (c) => {
  const { ports, cleanup } = await setup(c);
  try {
    const r = await runStrip(login, ports, { email: "", password: "" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.deepEqual(r.display, { type: "toast", message: "Enter your email and password." });
  } finally {
    cleanup();
  }
});

matrix("start, whoami, logout: a session finds its account until it is ended", async (c) => {
  const { ports, cleanup } = await setup(c);
  try {
    const account = await runStrip(login, ports, { email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password });
    assert.equal(account.ok, true);
    if (!account.ok) return;
    const session = await runStrip(start, ports, { accountId: account.value.id });
    assert.equal(session.ok, true);
    if (!session.ok) return;
    const who = await runStrip(whoami, ports, { token: session.value.token });
    assert.equal(who.ok && who.value.id, account.value.id);
    const ended = await runStrip(logout, ports, { token: session.value.token });
    assert.deepEqual(ended.ok && ended.value, { ended: true });
    const after = await runStrip(whoami, ports, { token: session.value.token });
    assert.equal(after.ok, false);
    if (!after.ok) assert.equal(after.error.kind, "unauthorized");
    const again = await runStrip(logout, ports, { token: session.value.token });
    assert.equal(again.ok, true, "ending an unknown session is not an error");
  } finally {
    cleanup();
  }
});

matrix("a session expires after seven days", async (c) => {
  const { ports, clock, cleanup } = await setup(c);
  try {
    const account = await runStrip(login, ports, { email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password });
    if (!account.ok) throw new Error("login failed");
    const session = await runStrip(start, ports, { accountId: account.value.id });
    if (!session.ok) throw new Error("start failed");
    clock.advance(7 * 24 * 60 * 60 * 1000 + 1000);
    const who = await runStrip(whoami, ports, { token: session.value.token });
    assert.equal(who.ok, false);
  } finally {
    cleanup();
  }
});

matrix("start for an unknown account is an internal error", async (c) => {
  const { ports, cleanup } = await setup(c);
  try {
    const r = await runStrip(start, ports, { accountId: "ghost" });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error.kind, "not_found");
      assert.equal(r.display.type, "generic");
    }
  } finally {
    cleanup();
  }
});

matrix("me returns the account, and an unknown id is not_found", async (c) => {
  const { ports, cleanup } = await setup(c);
  try {
    const account = await runStrip(login, ports, { email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password });
    if (!account.ok) throw new Error("login failed");
    const mine = await runStrip(me, ports, { accountId: account.value.id });
    assert.deepEqual(mine.ok && mine.value, account.value);
    const ghost = await runStrip(me, ports, { accountId: "ghost" });
    assert.equal(ghost.ok, false);
    if (!ghost.ok) assert.equal(ghost.error.kind, "not_found");
  } finally {
    cleanup();
  }
});

// Requirement 12.3: a known secret goes through every sensitive strip, and no log line, report or metric holds it.
matrix("no password or token reaches the logger, the reporter or the metrics", async (c) => {
  const { ports, logger, reporter, metrics, cleanup } = await setup(c);
  try {
    const secret = "S3cret-Pass-Phrase-XYZ";
    await runStrip(signup, ports, { email: "leak@example.com", password: secret });
    await runStrip(signup, ports, { email: "leak@example.com", password: secret }); // a conflict error
    await runStrip(login, ports, { email: "leak@example.com", password: "wrong-" + secret });
    const ok = await runStrip(login, ports, { email: "leak@example.com", password: secret });
    if (!ok.ok) throw new Error("login failed");
    const session = await runStrip(start, ports, { accountId: ok.value.id });
    if (!session.ok) throw new Error("start failed");
    await runStrip(whoami, ports, { token: session.value.token });
    await runStrip(logout, ports, { token: session.value.token });
    await runStrip(whoami, ports, { token: session.value.token }); // an unauthorized error with the token as input
    const everything = JSON.stringify([logger.entries, reporter.reports, metrics.points]);
    assert.ok(everything.length > 100, "something was recorded, so the check is not empty");
    assert.equal(everything.includes(secret), false, "the password is in a log, report or metric");
    assert.equal(everything.includes(session.value.token), false, "the session token is in a log, report or metric");
  } finally {
    cleanup();
  }
});

test("accounts strips: the sensitive ones are marked, and only accounts.me is not", () => {
  assert.deepEqual(
    [signup, login, start, logout, whoami, me].map((s) => [s.name, s.sensitive]),
    [["accounts.signup", true], ["accounts.login", true], ["accounts.start", true], ["accounts.logout", true], ["accounts.whoami", true], ["accounts.me", false]],
  );
});
