import assert from "node:assert/strict";
import { test } from "node:test";
import { portError } from "../../../lib/port-error.ts";
import { err } from "../../../lib/result.ts";
import type { Result } from "../../../lib/result.ts";
import type { Database, DbReader, DbWriter } from "../../../ports/database.ts";
import { createFixedClock } from "../../clock/fixed/index.ts";
import { createMemoryDatabase } from "../../database/memory/index.ts";
import { createSqliteDatabase } from "../../database/sqlite/index.ts";
import { runLimiterContract } from "../contract.test.ts";
import { errorMap } from "./errors.ts";
import { createDatabaseLimiter } from "./index.ts";

runLimiterContract("limiter/database (memory database)", () => {
  const clock = createFixedClock();
  return { limiter: createDatabaseLimiter({ database: createMemoryDatabase({ clock }), clock }), clock };
});

runLimiterContract("limiter/database (sqlite database)", () => {
  const clock = createFixedClock();
  const database = createSqliteDatabase({ clock, path: ":memory:" });
  return { limiter: createDatabaseLimiter({ database, clock }), clock };
});

const fail = (): Result<never> => err(portError("network", "database/fake", "store is down"));

/** A Database whose every method returns an error Result. */
function brokenDatabase(): Database {
  const reader: DbReader = { get: async () => fail(), findBy: async () => fail(), list: async () => fail() };
  const writer: DbWriter = { create: async () => fail(), update: async () => fail(), delete: async () => fail() };
  return {
    name: "broken",
    read: () => reader,
    write: () => writer,
    batch: async () => fail(),
    health: async () => fail(),
    migrate: async () => fail(),
  };
}

test("limiter/database: a failing database gives an error Result and does not throw", async () => {
  const limiter = createDatabaseLimiter({ database: brokenDatabase(), clock: createFixedClock() });
  const res = await limiter.check("k", { limit: 1, windowMs: 1000 });
  assert.equal(res.ok, false);
  assert.equal(!res.ok && res.error.kind, "network");
});

test("limiter/database: a database that throws gives an error Result, and later calls still work", async () => {
  const clock = createFixedClock();
  const inner = createMemoryDatabase({ clock });
  let broken = true;
  const database: Database = {
    ...inner,
    read: (c) => {
      if (broken) throw new Error("boom");
      return inner.read(c);
    },
  };
  const limiter = createDatabaseLimiter({ database, clock });
  const bad = await limiter.check("k", { limit: 2, windowMs: 1000 });
  assert.equal(bad.ok, false);
  assert.equal(!bad.ok && bad.error.kind, "unexpected");
  broken = false;
  const good = await limiter.check("k", { limit: 2, windowMs: 1000 });
  assert.equal(good.ok && good.value.remaining, 1);
});

test("limiter/database: migrate runs once, and again after a failed migrate", async () => {
  const clock = createFixedClock();
  const inner = createMemoryDatabase({ clock });
  let calls = 0;
  let failNext = true;
  const database: Database = {
    ...inner,
    migrate: async (defs) => {
      calls += 1;
      if (failNext) {
        failNext = false;
        return fail();
      }
      return inner.migrate(defs);
    },
  };
  const limiter = createDatabaseLimiter({ database, clock });
  assert.equal((await limiter.check("k", { limit: 2, windowMs: 1000 })).ok, false);
  assert.equal((await limiter.check("k", { limit: 2, windowMs: 1000 })).ok, true);
  assert.equal((await limiter.check("k", { limit: 2, windowMs: 1000 })).ok, true);
  assert.equal(calls, 2);
});

test("limiter/database: the previous window's record is deleted when a new window starts; the count stays <= limit + 1", async () => {
  const clock = createFixedClock();
  const database = createMemoryDatabase({ clock });
  const limiter = createDatabaseLimiter({ database, clock });
  const rule = { limit: 2, windowMs: 60_000 };
  for (let i = 0; i < 6; i += 1) await limiter.check("k", rule);
  let page = await database.read("rate_windows").list();
  assert.equal(page.ok && page.value.items.length, 1);
  assert.equal(page.ok && page.value.items[0]?.["count"], 3);
  clock.advance(60_000);
  await limiter.check("k", rule);
  page = await database.read("rate_windows").list();
  assert.equal(page.ok && page.value.items.length, 1);
  assert.equal(page.ok && page.value.items[0]?.["count"], 1);
});

test("limiter/database: a failing delete of the old window is ignored", async () => {
  const clock = createFixedClock();
  const inner = createMemoryDatabase({ clock });
  const database: Database = {
    ...inner,
    write: (c) => ({ ...inner.write(c), delete: async () => fail() }),
  };
  const limiter = createDatabaseLimiter({ database, clock });
  await limiter.check("k", { limit: 2, windowMs: 1000 });
  clock.advance(1000);
  assert.equal((await limiter.check("k", { limit: 2, windowMs: 1000 })).ok, true);
});

test("limiter/database: has the adapter name", () => {
  const clock = createFixedClock();
  assert.equal(createDatabaseLimiter({ database: createMemoryDatabase({ clock }), clock }).name, "database");
});

test("limiter/database: unmapped failures are unexpected", () => {
  assert.equal(errorMap.map(new Error("x")), "unexpected");
});
