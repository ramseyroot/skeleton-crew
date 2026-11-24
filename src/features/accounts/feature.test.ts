import assert from "node:assert/strict";
import { test } from "node:test";
import { AUTH_CASES, makeTestPorts } from "./testing.ts";
import { DEMO_ACCOUNT } from "./domain.ts";
import { accountsFeature } from "./feature.ts";

for (const c of AUTH_CASES) {
  test(`accounts seed [${c.name}]: the demo account exists, and seeding twice is fine`, async () => {
    const { ports, cleanup } = await makeTestPorts({ auth: c.auth, database: c.database });
    try {
      const again = await accountsFeature.seed?.(ports);
      assert.equal(again?.ok, true);
      const login = await ports.auth.verifyPassword(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password);
      assert.equal(login.ok, true);
    } finally {
      cleanup();
    }
  });
}

test("accounts feature: it declares the two Auth collections", () => {
  assert.deepEqual(accountsFeature.collections.map((x) => x.name), ["accounts", "sessions"]);
});
