import assert from "node:assert/strict";
import { test } from "node:test";
import { createFixedClock } from "../../clock/fixed/index.ts";
import { runDatabaseContract } from "../contract.test.ts";
import { errorMap } from "./errors.ts";
import { createMemoryDatabase } from "./index.ts";

runDatabaseContract("database/memory", () => {
  const clock = createFixedClock();
  return { db: createMemoryDatabase({ clock }), clock };
});

test("database/memory: two instances do not share data", async () => {
  const clock = createFixedClock();
  const a = createMemoryDatabase({ clock });
  const b = createMemoryDatabase({ clock });
  const defs = [{ name: "notes", fields: { body: { type: "string" as const } } }];
  await a.migrate(defs);
  await b.migrate(defs);
  await a.write("notes").create({ id: "n1", body: "x" });
  const got = await b.read("notes").get("n1");
  assert.ok(got.ok && got.value === null);
});

test("database/memory: an unexpected failure comes back as an unexpected Result error", async () => {
  const clock = { now: (): string => { throw new Error("clock broke"); } };
  const db = createMemoryDatabase({ clock });
  await db.migrate([{ name: "notes", fields: {} }]);
  const r = await db.write("notes").create({ id: "n1" });
  assert.ok(!r.ok);
  assert.equal(r.error.kind, "unexpected");
  assert.equal(r.error.step, "adapter:database/memory");
  assert.match(r.error.message, /clock broke/);
  const batch = await db.batch([{ op: "create", collection: "notes", record: { id: "n2" } }]);
  assert.ok(!batch.ok);
  assert.equal(batch.error.kind, "unexpected");
});

test("database/memory: unmapped failures are unexpected", () => {
  assert.equal(errorMap.map(new Error("x")), "unexpected");
  assert.equal(errorMap.rules.length, 0);
});
