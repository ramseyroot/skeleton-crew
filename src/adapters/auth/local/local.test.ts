import assert from "node:assert/strict";
import { test } from "node:test";
import { AUTH_COLLECTIONS } from "../../../ports/auth.ts";
import type { Database } from "../../../ports/database.ts";
import { createFixedClock } from "../../clock/fixed/index.ts";
import { createMemoryDatabase } from "../../database/memory/index.ts";
import { createSqliteDatabase } from "../../database/sqlite/index.ts";
import { createSequenceIds } from "../../ids/sequence/index.ts";
import { runAuthContract } from "../contract.test.ts";
import { errorMap } from "./errors.ts";
import { createLocalAuth } from "./index.ts";

function build(kind: "memory" | "sqlite") {
  const clock = createFixedClock();
  const database: Database =
    kind === "memory" ? createMemoryDatabase({ clock }) : createSqliteDatabase({ clock, path: ":memory:" });
  const auth = createLocalAuth({ database, clock, ids: createSequenceIds(), sessionTtlMs: undefined });
  return { auth, clock, database };
}

runAuthContract("auth/local (memory database)", () => build("memory"));
runAuthContract("auth/local (sqlite database)", () => build("sqlite"));

for (const kind of ["memory", "sqlite"] as const) {
  test(`auth/local (${kind}): only hashes are stored`, async () => {
    const { auth, database } = build(kind);
    const password = "correct horse battery";
    const a = await auth.createAccount({ email: "ada@example.com", password });
    const b = await auth.createAccount({ email: "bob@example.com", password });
    assert.ok(a.ok && b.ok);
    if (!a.ok || !b.ok) return;
    const s = await auth.createSession(a.value.id);
    assert.ok(s.ok);
    if (!s.ok) return;

    const accounts = await database.read("accounts").list();
    assert.ok(accounts.ok);
    if (!accounts.ok) return;
    assert.equal(accounts.value.items.length, 2);
    const hashes = accounts.value.items.map((r) => String(r.passwordHash));
    for (const h of hashes) {
      assert.ok(h.startsWith("scrypt:1:"));
      assert.equal(h.includes(password), false);
    }
    assert.notEqual(hashes[0], hashes[1]);

    const sessions = await database.read("sessions").list();
    assert.ok(sessions.ok);
    if (!sessions.ok) return;
    assert.equal(sessions.value.items.length, 1);
    const row = sessions.value.items[0];
    assert.match(String(row?.tokenHash), /^[0-9a-f]{64}$/);
    assert.equal(JSON.stringify(sessions.value).includes(s.value.token), false);
  });
}

test("auth/local: expired sessions are removed from the sessions collection when seen", async () => {
  const { auth, clock, database } = build("memory");
  const a = await auth.createAccount({ email: "ada@example.com", password: "correct horse battery" });
  assert.ok(a.ok);
  if (!a.ok) return;
  const s = await auth.createSession(a.value.id);
  assert.ok(s.ok);
  if (!s.ok) return;
  clock.advance(7 * 24 * 60 * 60 * 1000);
  assert.equal((await auth.verifySession(s.value.token)).ok, false);
  const left = await database.read("sessions").list();
  assert.deepEqual(left.ok && left.value.items.length, 0);
});

test("auth/local: migrates lazily and a failing database comes back as an error Result", async () => {
  const clock = createFixedClock();
  const real = createMemoryDatabase({ clock });
  let migrations = 0;
  const database: Database = {
    ...real,
    read: (c) => real.read(c),
    write: (c) => real.write(c),
    migrate: (defs) => {
      migrations += 1;
      return real.migrate(defs);
    },
  };
  const auth = createLocalAuth({ database, clock, ids: createSequenceIds() });
  assert.equal(migrations, 0);
  await auth.getAccount("x");
  await auth.getAccount("y");
  assert.equal(migrations, 1);

  const broken: Database = {
    ...real,
    migrate: () => {
      throw new Error("disk on fire");
    },
  };
  const bad = createLocalAuth({ database: broken, clock, ids: createSequenceIds() });
  const res = await bad.createAccount({ email: "ada@example.com", password: "correct horse battery" });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.kind, "unexpected");
  assert.ok(AUTH_COLLECTIONS.length === 2);
});

test("auth/local: an unknown email takes a comparable time to a wrong password", async () => {
  const { auth } = build("memory");
  await auth.createAccount({ email: "ada@example.com", password: "correct horse battery" });
  const time = async (email: string): Promise<number> => {
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 3; i++) {
      const t0 = process.hrtime.bigint();
      await auth.verifyPassword(email, "wrong password here");
      best = Math.min(best, Number(process.hrtime.bigint() - t0));
    }
    return best;
  };
  const wrong = await time("ada@example.com");
  const unknown = await time("nobody@example.com");
  assert.ok(unknown >= wrong * 0.3, `unknown ${unknown}ns vs wrong ${wrong}ns`);
});

test("auth/local: unmapped failures are unexpected", () => {
  assert.equal(errorMap.map(new Error("x")), "unexpected");
});
