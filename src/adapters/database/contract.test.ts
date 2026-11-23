// Contract suite for the Database port. Each adapter's test file calls runDatabaseContract with a factory
// that returns a fresh database and the fixed clock it was built with.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { FixedClock } from "../clock/fixed/index.ts";
import type { CollectionDef, Database, DbRecord, Scalar } from "../../ports/database.ts";
import type { ErrorKind, Result } from "../../lib/result.ts";

export type DatabaseHarness = { db: Database; clock: FixedClock };
export type MakeDatabase = () => DatabaseHarness;

export const USERS: CollectionDef = {
  name: "users",
  fields: {
    email: { type: "string", unique: true, normalize: "lower" },
    displayName: { type: "string", optional: true, indexed: true },
    age: { type: "number", optional: true },
    active: { type: "boolean", optional: true },
  },
};

function value<T>(r: Result<T>): T {
  assert.ok(r.ok, r.ok ? "" : `expected ok, got ${r.error.kind}: ${r.error.message}`);
  return r.value;
}

function failure(r: Result<unknown>, kind: ErrorKind): string {
  assert.ok(!r.ok, "expected an error, got ok");
  assert.equal(r.error.kind, kind, `expected ${kind}, got ${r.error.kind}: ${r.error.message}`);
  return r.error.message;
}

async function setup(make: MakeDatabase): Promise<DatabaseHarness> {
  const h = make();
  value(await h.db.migrate([USERS]));
  return h;
}

const ada = { id: "u1", email: "ada@example.com", displayName: "Ada", age: 36, active: true };

export function runDatabaseContract(name: string, make: MakeDatabase): void {
  test(`${name}: the database reports its name`, () => {
    assert.ok(["memory", "sqlite"].includes(make().db.name));
  });

  test(`${name}: health is ok on a usable database`, async () => {
    assert.deepEqual(value(await make().db.health()), { healthy: true });
  });

  test(`${name}: a collection that was not migrated is a validation error`, async () => {
    const { db } = make();
    const w = db.write("users");
    assert.match(failure(await w.create(ada), "validation"), /not migrated/);
    failure(await db.read("users").get("u1"), "validation");
    failure(await db.read("users").list(), "validation");
    failure(await db.read("users").findBy("email", "a"), "validation");
    failure(await w.update("u1", {}), "validation");
    failure(await w.delete("u1"), "validation");
    value(await db.migrate([USERS]));
    failure(await db.read("nope").get("x"), "validation");
    failure(await db.write("nope").create({ id: "x" }), "validation");
  });

  test(`${name}: migrate is idempotent and keeps data`, async () => {
    const { db } = await setup(make);
    value(await db.write("users").create(ada));
    value(await db.migrate([USERS]));
    value(await db.migrate([USERS]));
    assert.equal(value(await db.read("users").get("u1"))?.email, "ada@example.com");
    assert.equal(value(await db.read("users").list()).items.length, 1);
  });

  test(`${name}: migrate adds an optional field and keeps old fields`, async () => {
    const { db } = await setup(make);
    value(await db.write("users").create(ada));
    value(await db.migrate([{ name: "users", fields: { ...USERS.fields, nickname: { type: "string", optional: true } } }]));
    const rec = value(await db.read("users").get("u1"));
    assert.equal(rec?.nickname, null);
    assert.equal(rec?.age, 36);
    const patched = value(await db.write("users").update("u1", { nickname: "ace" }));
    assert.equal(patched.nickname, "ace");
    // a later call that leaves the field out keeps it
    value(await db.migrate([USERS]));
    assert.equal(value(await db.read("users").get("u1"))?.nickname, "ace");
  });

  test(`${name}: migrate rejects bad definitions`, async () => {
    const { db } = await setup(make);
    const bad = async (def: unknown, pattern: RegExp): Promise<void> => {
      assert.match(failure(await db.migrate([def as CollectionDef]), "validation"), pattern);
    };
    await bad({ name: "Users", fields: {} }, /collection name/);
    await bad({ name: "a-b", fields: {} }, /collection name/);
    await bad({ name: 'x"; drop', fields: {} }, /collection name/);
    await bad({ name: "things", fields: { "bad name": { type: "string" } } }, /field name/);
    await bad({ name: "things", fields: { id: { type: "string" } } }, /reserved/);
    await bad({ name: "things", fields: { createdAt: { type: "string" } } }, /reserved/);
    await bad({ name: "things", fields: { updatedat: { type: "string" } } }, /reserved/);
    await bad({ name: "things", fields: { a: { type: "date" } } }, /type/);
    await bad({ name: "things", fields: { a: { type: "number", normalize: "lower" } } }, /normalize/);
    await bad({ name: "things", fields: { fooBar: { type: "string" }, foobar: { type: "string" } } }, /case/);
    await bad({ name: "USERS2", fields: {} }, /collection name/);
    await bad({ name: "users", fields: { email: { type: "string" } } }, /different definition/);
    await bad({ name: "users", fields: { extra: { type: "string" } } }, /optional/);
    failure(await db.migrate("users" as unknown as CollectionDef[]), "validation");
    failure(await db.migrate([USERS, USERS]), "validation");
  });

  test(`${name}: collection names that differ only by case are rejected`, async () => {
    const { db } = make();
    value(await db.migrate([{ name: "itemA", fields: {} }]));
    assert.match(failure(await db.migrate([{ name: "itema", fields: {} }]), "validation"), /case/);
  });

  test(`${name}: create then get returns the record with clock timestamps`, async () => {
    const { db, clock } = await setup(make);
    clock.set("2026-03-04T05:06:07.000Z");
    const created = value(await db.write("users").create(ada));
    assert.deepEqual(created, {
      id: "u1",
      createdAt: "2026-03-04T05:06:07.000Z",
      updatedAt: "2026-03-04T05:06:07.000Z",
      email: "ada@example.com",
      displayName: "Ada",
      age: 36,
      active: true,
    });
    assert.deepEqual(value(await db.read("users").get("u1")), created);
  });

  test(`${name}: optional fields that are not given read back as null`, async () => {
    const { db } = await setup(make);
    const rec = value(await db.write("users").create({ id: "u1", email: "a@x.io" }));
    assert.equal(rec.displayName, null);
    assert.equal(rec.age, null);
    assert.equal(rec.active, null);
    const explicit = value(await db.write("users").create({ id: "u2", email: "b@x.io", age: null }));
    assert.equal(explicit.age, null);
  });

  test(`${name}: false, 0 and empty text are kept as given`, async () => {
    const { db } = await setup(make);
    value(await db.write("users").create({ id: "u1", email: "a@x.io", age: 0, active: false, displayName: "" }));
    const rec = value(await db.read("users").get("u1"));
    assert.equal(rec?.age, 0);
    assert.equal(rec?.active, false);
    assert.equal(rec?.displayName, "");
    value(await db.write("users").update("u1", { age: 2.5, active: true }));
    const again = value(await db.read("users").get("u1"));
    assert.equal(again?.age, 2.5);
    assert.equal(again?.active, true);
  });

  test(`${name}: get of a missing id is ok(null)`, async () => {
    const { db } = await setup(make);
    assert.equal(value(await db.read("users").get("nobody")), null);
  });

  test(`${name}: update changes only updatedAt and the given fields`, async () => {
    const { db, clock } = await setup(make);
    clock.set("2026-01-01T00:00:00.000Z");
    value(await db.write("users").create(ada));
    clock.set("2026-01-02T00:00:00.000Z");
    const updated = value(await db.write("users").update("u1", { age: 37 }));
    assert.deepEqual(updated, {
      id: "u1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      email: "ada@example.com",
      displayName: "Ada",
      age: 37,
      active: true,
    });
    assert.deepEqual(value(await db.read("users").get("u1")), updated);
  });

  test(`${name}: update can set an optional field to null, an empty patch only moves updatedAt`, async () => {
    const { db, clock } = await setup(make);
    value(await db.write("users").create(ada));
    clock.advance(1000);
    const cleared = value(await db.write("users").update("u1", { displayName: null }));
    assert.equal(cleared.displayName, null);
    clock.advance(1000);
    const same = value(await db.write("users").update("u1", {}));
    assert.equal(same.updatedAt, "2026-01-01T00:00:02.000Z");
    assert.equal(same.age, 36);
    assert.equal(same.createdAt, "2026-01-01T00:00:00.000Z");
  });

  test(`${name}: update and delete of a missing id are not_found`, async () => {
    const { db } = await setup(make);
    failure(await db.write("users").update("nobody", { age: 1 }), "not_found");
    failure(await db.write("users").delete("nobody"), "not_found");
  });

  test(`${name}: delete removes the record`, async () => {
    const { db } = await setup(make);
    value(await db.write("users").create(ada));
    value(await db.write("users").delete("u1"));
    assert.equal(value(await db.read("users").get("u1")), null);
    failure(await db.write("users").delete("u1"), "not_found");
    // the unique value is free again
    value(await db.write("users").create({ id: "u2", email: "ada@example.com" }));
  });

  test(`${name}: a duplicate id is a conflict and changes nothing`, async () => {
    const { db } = await setup(make);
    value(await db.write("users").create(ada));
    failure(await db.write("users").create({ id: "u1", email: "other@example.com" }), "conflict");
    assert.equal(value(await db.read("users").get("u1"))?.email, "ada@example.com");
    assert.equal(value(await db.read("users").list()).items.length, 1);
  });

  test(`${name}: a violated unique field is a conflict on create and on update`, async () => {
    const { db } = await setup(make);
    value(await db.write("users").create(ada));
    failure(await db.write("users").create({ id: "u2", email: "ada@example.com" }), "conflict");
    value(await db.write("users").create({ id: "u2", email: "grace@example.com" }));
    failure(await db.write("users").update("u2", { email: "ada@example.com" }), "conflict");
    assert.equal(value(await db.read("users").get("u2"))?.email, "grace@example.com");
    // writing a record's own value back is not a conflict
    value(await db.write("users").update("u2", { email: "grace@example.com" }));
  });

  test(`${name}: unique checks use the normalized value`, async () => {
    const { db } = await setup(make);
    value(await db.write("users").create(ada));
    failure(await db.write("users").create({ id: "u2", email: "ADA@Example.COM" }), "conflict");
    value(await db.write("users").create({ id: "u2", email: "grace@example.com" }));
    failure(await db.write("users").update("u2", { email: "Ada@example.com" }), "conflict");
  });

  test(`${name}: a null value in a unique optional field never conflicts`, async () => {
    const { db } = make();
    value(await db.migrate([{ name: "tags", fields: { slug: { type: "string", unique: true, optional: true } } }]));
    value(await db.write("tags").create({ id: "t1" }));
    value(await db.write("tags").create({ id: "t2", slug: null }));
    value(await db.write("tags").create({ id: "t3", slug: "x" }));
    failure(await db.write("tags").create({ id: "t4", slug: "x" }), "conflict");
  });

  test(`${name}: normalize lower lowercases on write and findBy matches ignoring case`, async () => {
    const { db } = await setup(make);
    const rec = value(await db.write("users").create({ id: "u1", email: "Ada@Example.COM" }));
    assert.equal(rec.email, "ada@example.com");
    assert.equal(value(await db.write("users").update("u1", { email: "ADA2@Example.com" })).email, "ada2@example.com");
    const found = value(await db.read("users").findBy("email", "Ada2@EXAMPLE.com"));
    assert.deepEqual(
      found.map((r) => r.id),
      ["u1"],
    );
    assert.equal(value(await db.read("users").findBy("email", "ADA@example.com")).length, 0);
  });

  test(`${name}: fields without normalize keep their case and match exactly`, async () => {
    const { db } = await setup(make);
    value(await db.write("users").create({ id: "u1", email: "a@x.io", displayName: "Ada" }));
    assert.equal(value(await db.read("users").get("u1"))?.displayName, "Ada");
    assert.equal(value(await db.read("users").findBy("displayName", "ada")).length, 0);
    assert.equal(value(await db.read("users").findBy("displayName", "Ada")).length, 1);
  });

  test(`${name}: findBy works on unique and indexed fields, ordered by id, empty when nothing matches`, async () => {
    const { db } = await setup(make);
    value(await db.write("users").create({ id: "u3", email: "c@x.io", displayName: "Sam" }));
    value(await db.write("users").create({ id: "u1", email: "a@x.io", displayName: "Sam" }));
    value(await db.write("users").create({ id: "u2", email: "b@x.io", displayName: "Kim" }));
    const sams = value(await db.read("users").findBy("displayName", "Sam"));
    assert.deepEqual(
      sams.map((r) => r.id),
      ["u1", "u3"],
    );
    assert.equal(value(await db.read("users").findBy("email", "b@x.io"))[0]?.id, "u2");
    assert.deepEqual(value(await db.read("users").findBy("displayName", "Nobody")), []);
    const none = value(await db.read("users").findBy("email", "zzz@x.io"));
    assert.deepEqual(none, []);
  });

  test(`${name}: findBy null finds records where an indexed field is not set`, async () => {
    const { db } = await setup(make);
    value(await db.write("users").create({ id: "u1", email: "a@x.io" }));
    value(await db.write("users").create({ id: "u2", email: "b@x.io", displayName: "B" }));
    const found = value(await db.read("users").findBy("displayName", null));
    assert.deepEqual(
      found.map((r) => r.id),
      ["u1"],
    );
  });

  test(`${name}: findBy on a field that is not indexed, unknown, or given the wrong type is validation`, async () => {
    const { db } = await setup(make);
    assert.match(failure(await db.read("users").findBy("age", 36), "validation"), /age/);
    failure(await db.read("users").findBy("active", true), "validation");
    failure(await db.read("users").findBy("nope", "x"), "validation");
    failure(await db.read("users").findBy("email", 5), "validation");
    failure(await db.read("users").findBy("id", "u1"), "validation");
  });

  test(`${name}: create validation errors name the problem and store nothing`, async () => {
    const { db } = await setup(make);
    const w = db.write("users");
    const bad = async (record: unknown, pattern: RegExp): Promise<void> => {
      assert.match(failure(await w.create(record as never), "validation"), pattern);
    };
    await bad({ id: "u1" }, /email/);
    await bad({ id: "u1", email: null }, /email/);
    await bad({ id: "u1", email: 5 }, /email/);
    await bad({ id: "u1", email: "a@x.io", age: "old" }, /age/);
    await bad({ id: "u1", email: "a@x.io", age: Number.NaN }, /age/);
    await bad({ id: "u1", email: "a@x.io", age: Number.POSITIVE_INFINITY }, /age/);
    await bad({ id: "u1", email: "a@x.io", active: 1 }, /active/);
    await bad({ id: "u1", email: "a@x.io", displayName: 7 }, /displayName/);
    await bad({ id: "u1", email: "a@x.io", colour: "red" }, /colour/);
    await bad({ id: "u1", email: "a@x.io", createdAt: "2020-01-01T00:00:00.000Z" }, /createdAt/);
    await bad({ id: "u1", email: "a@x.io", updatedAt: "x" }, /updatedAt/);
    await bad({ email: "a@x.io" }, /id/);
    await bad({ id: "", email: "a@x.io" }, /id/);
    await bad({ id: 5, email: "a@x.io" }, /id/);
    await bad(null, /object/);
    assert.equal(value(await db.read("users").list()).items.length, 0);
  });

  test(`${name}: update validation errors name the problem and change nothing`, async () => {
    const { db } = await setup(make);
    value(await db.write("users").create(ada));
    const w = db.write("users");
    const bad = async (patch: unknown, pattern: RegExp): Promise<void> => {
      assert.match(failure(await w.update("u1", patch as never), "validation"), pattern);
    };
    await bad({ id: "u9" }, /id/);
    await bad({ createdAt: "2020-01-01T00:00:00.000Z" }, /createdAt/);
    await bad({ updatedAt: "2020-01-01T00:00:00.000Z" }, /updatedAt/);
    await bad({ colour: "red" }, /colour/);
    await bad({ age: "old" }, /age/);
    await bad({ email: null }, /email/);
    await bad({ age: undefined }, /age/);
    await bad(null, /object/);
    // an invalid patch is reported before a missing id
    assert.match(failure(await w.update("nobody", { colour: "x" }), "validation"), /colour/);
    const rec = value(await db.read("users").get("u1"));
    assert.equal(rec?.age, 36);
    assert.equal(rec?.updatedAt, "2026-01-01T00:00:00.000Z");
  });

  test(`${name}: values that look like SQL or markup are stored as plain text`, async () => {
    const { db } = await setup(make);
    const nasty = `x'); DROP TABLE "users"; --`;
    value(await db.write("users").create({ id: "u1'--", email: "a@x.io", displayName: nasty }));
    assert.equal(value(await db.read("users").get("u1'--"))?.displayName, nasty);
    assert.equal(value(await db.read("users").findBy("displayName", nasty)).length, 1);
    assert.equal(value(await db.read("users").list()).items.length, 1);
  });

  test(`${name}: list of an empty collection is an empty page`, async () => {
    const { db } = await setup(make);
    assert.deepEqual(value(await db.read("users").list()), { items: [], nextCursor: null });
  });

  async function seed(db: Database, count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const id = `u${String(i).padStart(3, "0")}`;
      ids.push(id);
      value(await db.write("users").create({ id, email: `${id}@x.io` }));
    }
    return ids;
  }

  test(`${name}: list is ordered by id and pages with an opaque cursor`, async () => {
    const { db } = await setup(make);
    for (const id of ["u5", "u2", "u9", "u1", "u7"]) value(await db.write("users").create({ id, email: `${id}@x.io` }));
    const first = value(await db.read("users").list({ limit: 2 }));
    assert.deepEqual(
      first.items.map((r) => r.id),
      ["u1", "u2"],
    );
    assert.equal(typeof first.nextCursor, "string");
    assert.equal(first.nextCursor, Buffer.from("u2").toString("base64url"));
    const second = value(await db.read("users").list({ limit: 2, cursor: first.nextCursor ?? "" }));
    assert.deepEqual(
      second.items.map((r) => r.id),
      ["u5", "u7"],
    );
    const third = value(await db.read("users").list({ limit: 2, cursor: second.nextCursor ?? "" }));
    assert.deepEqual(
      third.items.map((r) => r.id),
      ["u9"],
    );
    assert.equal(third.nextCursor, null);
  });

  test(`${name}: nextCursor is null when the last page is exactly full`, async () => {
    const { db } = await setup(make);
    await seed(db, 4);
    const page = value(await db.read("users").list({ limit: 4 }));
    assert.equal(page.items.length, 4);
    assert.equal(page.nextCursor, null);
    const half = value(await db.read("users").list({ limit: 2 }));
    const rest = value(await db.read("users").list({ limit: 2, cursor: half.nextCursor ?? "" }));
    assert.equal(rest.items.length, 2);
    assert.equal(rest.nextCursor, null);
  });

  test(`${name}: walking every page returns every record once`, async () => {
    const { db } = await setup(make);
    const ids = await seed(db, 23);
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guardCount = 0; guardCount < 20; guardCount++) {
      const page = value(await db.read("users").list(cursor === undefined ? { limit: 5 } : { limit: 5, cursor }));
      seen.push(...page.items.map((r) => r.id));
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
    }
    assert.deepEqual(seen, ids);
  });

  test(`${name}: list limits default to 50 and stop at 200`, async () => {
    const { db } = await setup(make);
    await seed(db, 55);
    const page = value(await db.read("users").list());
    assert.equal(page.items.length, 50);
    assert.notEqual(page.nextCursor, null);
    const all = value(await db.read("users").list({ limit: 200 }));
    assert.equal(all.items.length, 55);
    assert.equal(all.nextCursor, null);
  });

  test(`${name}: list rejects a limit below 1 or above 200 and a bad cursor`, async () => {
    const { db } = await setup(make);
    const r = db.read("users");
    failure(await r.list({ limit: 0 }), "validation");
    failure(await r.list({ limit: -1 }), "validation");
    failure(await r.list({ limit: 201 }), "validation");
    failure(await r.list({ limit: 1.5 }), "validation");
    failure(await r.list({ limit: Number.NaN }), "validation");
    assert.match(failure(await r.list({ cursor: "!!!not base64!!!" }), "validation"), /cursor/);
    failure(await r.list({ cursor: "" }), "validation");
    failure(await r.list({ cursor: 5 as unknown as string }), "validation");
    value(await r.list({ limit: 1 }));
    value(await r.list({ limit: 200 }));
  });

  test(`${name}: returned records are copies`, async () => {
    const { db } = await setup(make);
    const created = value(await db.write("users").create(ada));
    created.age = 99;
    (created as Record<string, Scalar>).extra = "x";
    const got = value(await db.read("users").get("u1")) as DbRecord;
    assert.equal(got.age, 36);
    assert.equal("extra" in got, false);
    got.displayName = "Changed";
    const listed = value(await db.read("users").list());
    assert.equal(listed.items[0]?.displayName, "Ada");
    listed.items[0]!.displayName = "Changed again";
    assert.equal(value(await db.read("users").findBy("displayName", "Ada"))[0]?.id, "u1");
    value(await db.read("users").findBy("displayName", "Ada"))[0]!.age = 1;
    assert.equal(value(await db.read("users").get("u1"))?.age, 36);
    const updated = value(await db.write("users").update("u1", { age: 40 }));
    updated.age = 1;
    assert.equal(value(await db.read("users").get("u1"))?.age, 40);
  });

  test(`${name}: a record is not changed by later edits to the object that created it`, async () => {
    const { db } = await setup(make);
    const input = { id: "u1", email: "a@x.io", age: 1 };
    value(await db.write("users").create(input));
    input.age = 2;
    assert.equal(value(await db.read("users").get("u1"))?.age, 1);
  });

  test(`${name}: collections do not share records`, async () => {
    const { db } = await setup(make);
    value(await db.migrate([{ name: "notes", fields: { body: { type: "string" } } }]));
    value(await db.write("users").create({ id: "same", email: "a@x.io" }));
    assert.equal(value(await db.read("notes").get("same")), null);
    value(await db.write("notes").create({ id: "same", body: "hi" }));
    assert.equal(value(await db.read("users").get("same"))?.email, "a@x.io");
    assert.equal(value(await db.read("notes").get("same"))?.body, "hi");
  });

  test(`${name}: batch applies every op and later ops see earlier ones`, async () => {
    const { db, clock } = await setup(make);
    value(await db.write("users").create({ id: "old", email: "old@x.io" }));
    clock.advance(5000);
    value(
      await db.batch([
        { op: "create", collection: "users", record: { id: "u1", email: "a@x.io", age: 1 } },
        { op: "update", collection: "users", id: "u1", patch: { age: 2 } },
        { op: "delete", collection: "users", id: "old" },
        { op: "create", collection: "users", record: { id: "old", email: "old@x.io" } },
      ]),
    );
    const u1 = value(await db.read("users").get("u1"));
    assert.equal(u1?.age, 2);
    assert.equal(u1?.createdAt, "2026-01-01T00:00:05.000Z");
    assert.equal(value(await db.read("users").list()).items.length, 2);
    assert.equal(value(await db.read("users").get("old"))?.createdAt, "2026-01-01T00:00:05.000Z");
  });

  test(`${name}: an empty batch is ok`, async () => {
    const { db } = await setup(make);
    value(await db.batch([]));
  });

  test(`${name}: a failing batch applies nothing and names the op and the kind`, async () => {
    const { db } = await setup(make);
    value(await db.write("users").create({ id: "keep", email: "keep@x.io", age: 1 }));
    const message = failure(
      await db.batch([
        { op: "create", collection: "users", record: { id: "u1", email: "a@x.io" } },
        { op: "update", collection: "users", id: "keep", patch: { age: 2 } },
        { op: "update", collection: "users", id: "u1", patch: { age: 3 } },
        { op: "update", collection: "users", id: "missing", patch: { age: 3 } },
        { op: "delete", collection: "users", id: "keep" },
      ]),
      "not_found",
    );
    assert.ok(message.includes("op 3 (update users missing): not_found"), message);
    assert.equal(value(await db.read("users").get("u1")), null);
    assert.equal(value(await db.read("users").get("keep"))?.age, 1);
    assert.equal(value(await db.read("users").list()).items.length, 1);
  });

  test(`${name}: a batch gives the same kind the single op would`, async () => {
    const { db } = await setup(make);
    value(await db.write("users").create(ada));
    const conflict = failure(
      await db.batch([
        { op: "create", collection: "users", record: { id: "u2", email: "b@x.io" } },
        { op: "create", collection: "users", record: { id: "u3", email: "ADA@example.com" } },
      ]),
      "conflict",
    );
    assert.ok(conflict.includes("op 1 (create users u3): conflict"), conflict);
    const dup = failure(await db.batch([{ op: "create", collection: "users", record: { id: "u1", email: "z@x.io" } }]), "conflict");
    assert.ok(dup.includes("op 0 (create users u1): conflict"), dup);
    const invalid = failure(
      await db.batch([{ op: "update", collection: "users", id: "u1", patch: { age: "x" } }]),
      "validation",
    );
    assert.ok(invalid.includes("op 0 (update users u1): validation"), invalid);
    const unknown = failure(await db.batch([{ op: "delete", collection: "nope", id: "u1" }]), "validation");
    assert.ok(unknown.includes("op 0 (delete nope u1): validation"), unknown);
    const del = failure(await db.batch([{ op: "delete", collection: "users", id: "ghost" }]), "not_found");
    assert.ok(del.includes("op 0 (delete users ghost): not_found"), del);
    assert.equal(value(await db.read("users").get("u2")), null);
    assert.equal(value(await db.read("users").list()).items.length, 1);
  });

  test(`${name}: a failed batch leaves unique values and ids free`, async () => {
    const { db } = await setup(make);
    failure(
      await db.batch([
        { op: "create", collection: "users", record: { id: "u1", email: "a@x.io" } },
        { op: "delete", collection: "users", id: "ghost" },
      ]),
      "not_found",
    );
    value(await db.write("users").create({ id: "u1", email: "a@x.io" }));
  });

  test(`${name}: a malformed batch is a validation error, not a throw`, async () => {
    const { db } = await setup(make);
    failure(await db.batch("nope" as unknown as []), "validation");
    failure(await db.batch([{ op: "explode", collection: "users" } as never]), "validation");
    failure(await db.batch([null as never]), "validation");
  });

  test(`${name}: methods never throw on odd input`, async () => {
    const { db } = await setup(make);
    failure(await db.write("users").create(undefined as never), "validation");
    failure(await db.write("users").update("u1", undefined as never), "validation");
    failure(await db.migrate(undefined as never), "validation");
    assert.equal(value(await db.read("users").get("")), null);
  });
}
