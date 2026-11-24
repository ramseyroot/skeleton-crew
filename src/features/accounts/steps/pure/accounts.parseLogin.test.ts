import assert from "node:assert/strict";
import { test } from "node:test";
import { makeTestPorts } from "../../testing.ts";
import { parseLogin } from "./accounts.parseLogin.ts";

test("pure.accounts.parseLogin: trims the email and keeps the password as typed", async () => {
  const { ports } = await makeTestPorts({ seed: false });
  const r = await parseLogin.execute({ email: " ada@example.com ", password: " pw " }, { stripId: "s", ports });
  assert.deepEqual(r, { ok: true, value: { email: "ada@example.com", password: " pw " } });
});

test("pure.accounts.parseLogin: a short password is allowed, because a login form does not teach the sign-up rules", async () => {
  const { ports } = await makeTestPorts({ seed: false });
  const r = await parseLogin.execute({ email: "ada@example.com", password: "x" }, { stripId: "s", ports });
  assert.equal(r.ok, true);
});

for (const [email, password] of [["", "pw"], ["ada@example.com", ""], ["   ", "pw"]] as const) {
  test(`pure.accounts.parseLogin: ${JSON.stringify(email)} with ${password.length} password characters is rejected`, async () => {
    const { ports } = await makeTestPorts({ seed: false });
    const r = await parseLogin.execute({ email, password }, { stripId: "s", ports });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error.audience, "user");
      assert.equal(r.error.userMessage, "Enter your email and password.");
    }
  });
}
