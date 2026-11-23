import assert from "node:assert/strict";
import { test } from "node:test";
import { DATABASE_KINDS, makeTestPorts } from "../../test-utils/ports.ts";
import { setUserDisplayName } from "./user.setDisplayName.ts";

for (const database of DATABASE_KINDS) {
  test(`db.user.setDisplayName (${database}): renames a user`, async (t) => {
    const { ports, cleanup } = await makeTestPorts({ database });
    t.after(cleanup);
    const r = await setUserDisplayName.execute({ userId: "u1", displayName: "Ada L." }, { stripId: "s", ports });
    assert.deepEqual(r, { ok: true, value: { userId: "u1", displayName: "Ada L." } });
    const stored = await ports.database.read("users").get("u1");
    assert.equal(stored.ok && stored.value?.displayName, "Ada L.");
  });

  test(`db.user.setDisplayName (${database}): a taken name is a conflict the user can fix, ignoring case`, async (t) => {
    const { ports, cleanup } = await makeTestPorts({ database });
    t.after(cleanup);
    const r = await setUserDisplayName.execute({ userId: "u1", displayName: "GRACE" }, { stripId: "s", ports });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error.kind, "conflict");
      assert.equal(r.error.audience, "user");
      assert.equal(r.error.userMessage, "That name is taken. Please choose another.");
      assert.equal(r.error.step, "db.user.setDisplayName");
    }
  });

  test(`db.user.setDisplayName (${database}): an unknown user is not_found and internal`, async (t) => {
    const { ports, cleanup } = await makeTestPorts({ database });
    t.after(cleanup);
    const r = await setUserDisplayName.execute({ userId: "ghost", displayName: "Nobody" }, { stripId: "s", ports });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error.kind, "not_found");
      assert.equal(r.error.audience, "internal");
      assert.equal(r.error.step, "db.user.setDisplayName");
      assert.equal(r.error.stripId, "s");
    }
  });
}

test("db.user.setDisplayName: it declares writes to users only", () => {
  assert.deepEqual(setUserDisplayName.manifest.permissions, { reads: [], writes: ["users"], storage: [] });
});
