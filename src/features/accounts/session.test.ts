import assert from "node:assert/strict";
import { test } from "node:test";
import { AUTH_CASES, makeTestPorts } from "./testing.ts";
import { DEMO_ACCOUNT } from "./domain.ts";
import { sessionCookieOptions, signIn } from "./session.ts";

for (const c of AUTH_CASES) {
  test(`signIn [${c.name}]: login starts a session that belongs to the account`, async () => {
    const { ports, cleanup } = await makeTestPorts({ auth: c.auth, database: c.database });
    try {
      const out = await signIn(ports, "login", { email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password });
      assert.equal(out.result.ok, true);
      assert.ok(out.session);
      const who = await ports.auth.verifySession(out.session.token);
      assert.equal(who.ok && who.value.email, DEMO_ACCOUNT.email);
    } finally {
      cleanup();
    }
  });

  test(`signIn [${c.name}]: signup creates the account and a session`, async () => {
    const { ports, cleanup } = await makeTestPorts({ auth: c.auth, database: c.database });
    try {
      const out = await signIn(ports, "signup", { email: "new@example.com", password: "a-fresh-password-1" });
      assert.equal(out.result.ok, true);
      assert.ok(out.session);
    } finally {
      cleanup();
    }
  });

  test(`signIn [${c.name}]: a failure gives a public result and no session`, async () => {
    const { ports, cleanup } = await makeTestPorts({ auth: c.auth, database: c.database });
    try {
      const out = await signIn(ports, "login", { email: DEMO_ACCOUNT.email, password: "wrong" });
      assert.equal(out.session, undefined);
      assert.equal(out.result.ok, false);
      if (!out.result.ok) {
        assert.deepEqual(out.result.display, { type: "toast", message: "Email or password is wrong." });
        assert.equal("error" in out.result, false, "the StepError never crosses to the browser");
      }
    } finally {
      cleanup();
    }
  });
}

test("sessionCookieOptions: HttpOnly, SameSite=Lax, Secure outside local", () => {
  const local = sessionCookieOptions("local", "2026-12-01T00:00:00.000Z");
  assert.deepEqual({ ...local, expires: local.expires.toISOString() }, {
    httpOnly: true, sameSite: "lax", secure: false, path: "/", expires: "2026-12-01T00:00:00.000Z",
  });
  for (const env of ["dev", "staging", "prod"]) assert.equal(sessionCookieOptions(env, "2026-12-01T00:00:00.000Z").secure, true);
});
