import assert from "node:assert/strict";
import { test } from "node:test";
import { DATABASE_KINDS, makeTestPorts } from "../../testing.ts";
import { findUserProfile } from "./user.findProfile.ts";

for (const database of DATABASE_KINDS) {
  test(`db.user.findProfile (${database}): reads the user when nothing is cached`, async (t) => {
    const { ports, cleanup } = await makeTestPorts({ database });
    t.after(cleanup);
    for (const input of [{ userId: "u1" }, { userId: "u1", cached: null }]) {
      const r = await findUserProfile.execute(input, { stripId: "s", ports });
      assert.deepEqual(r, { ok: true, value: { userId: "u1", displayName: "Ada" } });
    }
  });

  test(`db.user.findProfile (${database}): an unknown user is not_found`, async (t) => {
    const { ports, cleanup } = await makeTestPorts({ database });
    t.after(cleanup);
    const r = await findUserProfile.execute({ userId: "ghost" }, { stripId: "s", ports });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.kind, "not_found");
  });
}

test("db.user.findProfile: a cached profile is returned without reading the database", async () => {
  const { ports } = await makeTestPorts();
  let reads = 0;
  const database = { ...ports.database, read: (c: string) => { reads += 1; return ports.database.read(c); } };
  const r = await findUserProfile.execute(
    { userId: "u1", cached: { userId: "u1", displayName: "From cache" } },
    { stripId: "s", ports: { ...ports, database } },
  );
  assert.deepEqual(r, { ok: true, value: { userId: "u1", displayName: "From cache" } });
  assert.equal(reads, 0);
});

test("db.user.findProfile: it declares reads of users only", () => {
  assert.deepEqual(findUserProfile.manifest.permissions, { reads: ["users"], writes: [], storage: [] });
});
