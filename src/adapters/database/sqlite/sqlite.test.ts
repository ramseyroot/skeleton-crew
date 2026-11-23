import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createFixedClock } from "../../clock/fixed/index.ts";
import { runDatabaseContract, USERS } from "../contract.test.ts";
import { errorMap } from "./errors.ts";
import { createSqliteDatabase } from "./index.ts";

runDatabaseContract("database/sqlite", () => {
  const clock = createFixedClock();
  return { db: createSqliteDatabase({ clock, path: ":memory:" }), clock };
});

/** Runs fn, expects it to throw, and checks the kind the error map gives the thrown error. */
function assertMapsTo(fn: () => unknown, kind: string): void {
  try {
    fn();
  } catch (thrown) {
    assert.equal(errorMap.map(thrown), kind);
    return;
  }
  assert.fail("expected the call to throw");
}

test("database/sqlite: error map sends real constraint failures to conflict", () => {
  const db = new DatabaseSync(":memory:");
  db.exec('CREATE TABLE t (id TEXT PRIMARY KEY, email TEXT NOT NULL)');
  db.exec("CREATE UNIQUE INDEX t_email ON t (email)");
  db.prepare("INSERT INTO t (id, email) VALUES (?, ?)").run("a", "x");
  assertMapsTo(() => db.prepare("INSERT INTO t (id, email) VALUES (?, ?)").run("b", "x"), "conflict");
  assertMapsTo(() => db.prepare("INSERT INTO t (id, email) VALUES (?, ?)").run("a", "y"), "conflict");
});

test("database/sqlite: error map sends a real NOT NULL failure to validation", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE t (id TEXT PRIMARY KEY, email TEXT NOT NULL)");
  assertMapsTo(() => db.prepare("INSERT INTO t (id, email) VALUES (?, ?)").run("a", null), "validation");
});

test("database/sqlite: error map sends a real busy failure to network", () => {
  const dir = mkdtempSync(join(tmpdir(), "sqlite-busy-"));
  const file = join(dir, "busy.db");
  const a = new DatabaseSync(file);
  const b = new DatabaseSync(file, { timeout: 0 });
  try {
    a.exec("CREATE TABLE t (x TEXT)");
    a.exec("BEGIN IMMEDIATE");
    assertMapsTo(() => b.exec("BEGIN IMMEDIATE"), "network");
  } finally {
    a.close();
    b.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("database/sqlite: other sqlite failures and non-sqlite errors are unexpected", () => {
  const db = new DatabaseSync(":memory:");
  assertMapsTo(() => db.exec("SELECT * FROM missing_table"), "unexpected");
  assertMapsTo(() => new DatabaseSync("/nonexistent-dir/x.db").exec("SELECT 1"), "unexpected");
  assert.equal(errorMap.map(new Error("x")), "unexpected");
  assert.equal(errorMap.map("text"), "unexpected");
  assert.equal(errorMap.map(null), "unexpected");
  assert.equal(errorMap.map({ code: "ERR_SQLITE_ERROR", errcode: "19" }), "unexpected");
});

test("database/sqlite: a constraint failure inside the adapter comes back as conflict through the error map", async () => {
  const clock = createFixedClock();
  const db = createSqliteDatabase({ clock, path: ":memory:" });
  await db.migrate([USERS]);
  await db.write("users").create({ id: "u1", email: "a@x.io" });
  const dup = await db.write("users").create({ id: "u1", email: "b@x.io" });
  assert.ok(!dup.ok);
  assert.equal(dup.error.kind, "conflict");
  assert.equal(dup.error.step, "adapter:database/sqlite");
  assert.match(dup.error.message, /UNIQUE constraint failed/);
  const clash = await db.write("users").create({ id: "u2", email: "a@x.io" });
  assert.ok(!clash.ok);
  assert.equal(clash.error.kind, "conflict");
});

test("database/sqlite: a provider failure inside a port method is a Result error, never a throw", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sqlite-fail-"));
  const file = join(dir, "fail.db");
  try {
    const db = createSqliteDatabase({ clock: createFixedClock(), path: file });
    assert.ok((await db.migrate([USERS])).ok);
    const raw = new DatabaseSync(file);
    raw.exec('DROP TABLE "users"'); // the table disappears behind the adapter's back
    raw.close();
    for (const r of [
      await db.read("users").get("u1"),
      await db.read("users").list(),
      await db.write("users").create({ id: "u1", email: "a@x.io" }),
      await db.batch([{ op: "delete", collection: "users", id: "u1" }]),
    ]) {
      assert.ok(!r.ok);
      assert.equal(r.error.kind, "unexpected");
      assert.equal(r.error.step, "adapter:database/sqlite");
      assert.match(r.error.message, /no such table/);
    }
    assert.ok(db.close().ok);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("database/sqlite: health fails with network or unexpected when the file cannot be opened", async () => {
  const db = createSqliteDatabase({ clock: createFixedClock(), path: "/nonexistent-dir/db.sqlite" });
  const h = await db.health();
  assert.ok(!h.ok);
  assert.ok(["network", "unexpected"].includes(h.error.kind));
  const m = await db.migrate([USERS]);
  assert.ok(!m.ok);
  assert.ok(["network", "unexpected"].includes(m.error.kind));
  const g = await db.read("users").get("u1");
  assert.ok(!g.ok);
});

test("database/sqlite: a file database keeps data and collection definitions across opens", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sqlite-file-"));
  const file = join(dir, "app.db");
  try {
    const clock = createFixedClock();
    const first = createSqliteDatabase({ clock, path: file });
    assert.ok((await first.migrate([USERS])).ok);
    assert.ok((await first.write("users").create({ id: "u1", email: "Ada@x.io", active: true })).ok);
    assert.ok(first.close().ok);
    const second = createSqliteDatabase({ clock, path: file });
    const got = await second.read("users").get("u1");
    assert.ok(got.ok);
    assert.equal(got.value?.email, "ada@x.io");
    assert.equal(got.value?.active, true);
    assert.ok((await second.migrate([USERS])).ok);
    const dup = await second.write("users").create({ id: "u2", email: "ADA@x.io" });
    assert.ok(!dup.ok);
    assert.equal(dup.error.kind, "conflict");
    assert.ok(second.close().ok);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("database/sqlite: unique and indexed fields get real indexes, and values are bound not spliced", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sqlite-idx-"));
  const file = join(dir, "idx.db");
  try {
    const db = createSqliteDatabase({ clock: createFixedClock(), path: file });
    assert.ok((await db.migrate([USERS])).ok);
    const raw = new DatabaseSync(file);
    const names = (raw.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'users'").all() as { name: string }[]).map((r) => r.name);
    assert.ok(names.some((n) => n.endsWith("_email")), names.join(","));
    assert.ok(names.some((n) => n.endsWith("_displayName")), names.join(","));
    assert.equal(names.some((n) => n.endsWith("_age")), false);
    const nasty = `x'); DROP TABLE users; --`;
    assert.ok((await db.write("users").create({ id: nasty, email: nasty })).ok);
    assert.ok(raw.prepare("SELECT 1 FROM users").get() !== undefined);
    raw.close();
    assert.ok(db.close().ok);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("database/sqlite: a failed migrate changes nothing", async () => {
  const db = createSqliteDatabase({ clock: createFixedClock(), path: ":memory:" });
  assert.ok((await db.migrate([USERS])).ok);
  const bad = await db.migrate([
    { name: "notes", fields: { body: { type: "string" } } },
    { name: "users", fields: { email: { type: "number" } } },
  ]);
  assert.ok(!bad.ok);
  assert.equal(bad.error.kind, "validation");
  const notes = await db.read("notes").get("n1");
  assert.ok(!notes.ok);
  assert.equal(notes.error.kind, "validation");
});

test("database/sqlite: unmapped failures are unexpected", () => {
  assert.equal(errorMap.fallback, "unexpected");
});
