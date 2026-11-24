import assert from "node:assert/strict";
import { test } from "node:test";
import { makeTestPorts } from "../../testing.ts";
import { parseSignup } from "./accounts.parseSignup.ts";

const cases: [string, string, string | null][] = [
  ["ada@example.com", "long-enough-password", null],
  ["  ada@example.com  ", "long-enough-password", null],
  ["not-an-email", "long-enough-password", "Enter a valid email address."],
  ["ada@example.com", "short", "Use at least 10 characters for your password."],
  ["ada@example.com", "x".repeat(201), "Use at most 200 characters for your password."],
];

for (const [email, password, message] of cases) {
  test(`pure.accounts.parseSignup: ${JSON.stringify(email)} with a ${password.length}-character password`, async () => {
    const { ports } = await makeTestPorts({ seed: false });
    const r = await parseSignup.execute({ email, password }, { stripId: "s", ports });
    if (message === null) {
      assert.deepEqual(r, { ok: true, value: { email: email.trim(), password } });
    } else {
      assert.equal(r.ok, false);
      if (!r.ok) {
        assert.equal(r.error.kind, "validation");
        assert.equal(r.error.audience, "user");
        assert.equal(r.error.userMessage, message);
      }
    }
  });
}

test("pure.accounts.parseSignup: it is sensitive, so its manifest says so", () => {
  assert.equal(parseSignup.manifest.sensitive, true);
});
