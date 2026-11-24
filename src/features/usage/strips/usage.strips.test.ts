import assert from "node:assert/strict";
import { test } from "node:test";
import { runStrip } from "../../../lib/strip.ts";
import type { Principal } from "../../../lib/principal.ts";
import { DATABASE_KINDS, makeTestPorts } from "../testing.ts";
import type { DatabaseKind } from "../testing.ts";
import type { Outcome } from "../domain.ts";
import { month } from "./usage.month.strip.ts";
import { record } from "./usage.record.strip.ts";

function matrix(name: string, body: (database: DatabaseKind) => Promise<void>) {
  for (const database of DATABASE_KINDS) test(`usage strips [db ${database}]: ${name}`, () => body(database));
}

const DAY = 24 * 60 * 60 * 1000;
const accountOf = (p: Principal): string => (p.kind === "anonymous" ? "" : p.accountId);
const hit = (accountId: string, endpoint: string, outcome: Outcome, subject = "key1") => ({ accountId, subject, endpoint, outcome });

matrix("record counts each outcome class, and month shows the same numbers by endpoint", async (database) => {
  const env = await makeTestPorts({ database });
  try {
    const a = accountOf(env.principals.ada);
    for (const [endpoint, outcome] of [["me.get", "ok"], ["me.get", "ok"], ["me.get", "client_error"], ["drugs.search", "ok"], ["drugs.search", "server_error"]] as const) {
      const r = await runStrip(record, env.ports, hit(a, endpoint, outcome));
      assert.equal(r.ok, true);
    }
    const r = await runStrip(month, env.ports, { principal: env.principals.ada });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.value, {
      month: "2026-11",
      total: 5,
      byEndpoint: [
        { endpoint: "drugs.search", ok: 1, clientError: 0, serverError: 1, total: 2 },
        { endpoint: "me.get", ok: 2, clientError: 1, serverError: 0, total: 3 },
      ],
    });
  } finally {
    env.cleanup();
  }
});

matrix("the row key is per key, endpoint and day, and the total grows by one each time", async (database) => {
  const env = await makeTestPorts({ database });
  try {
    const a = accountOf(env.principals.ada);
    const first = await runStrip(record, env.ports, hit(a, "me.get", "ok", "k1"));
    const second = await runStrip(record, env.ports, hit(a, "me.get", "ok", "k1"));
    assert.deepEqual(first.ok && first.value, { counterKey: "k1:me.get:2026-11-23", total: 1 });
    assert.deepEqual(second.ok && second.value, { counterKey: "k1:me.get:2026-11-23", total: 2 });
    env.clock.advance(DAY);
    const nextDay = await runStrip(record, env.ports, hit(a, "me.get", "ok", "k1"));
    assert.deepEqual(nextDay.ok && nextDay.value, { counterKey: "k1:me.get:2026-11-24", total: 1 });
    const other = await runStrip(record, env.ports, hit(a, "me.get", "ok", "k2"));
    assert.equal(other.ok && other.value.total, 1);
    const rows = await env.ports.database.read("usage_counters").list();
    assert.equal(rows.ok && rows.value.items.length, 3);
  } finally {
    env.cleanup();
  }
});

matrix("fifty requests at once are all counted", async (database) => {
  const env = await makeTestPorts({ database });
  try {
    const a = accountOf(env.principals.ada);
    const results = await Promise.all(Array.from({ length: 50 }, () => runStrip(record, env.ports, hit(a, "me.get", "ok"))));
    assert.equal(results.every((r) => r.ok), true);
    const r = await runStrip(month, env.ports, { principal: env.principals.ada });
    assert.equal(r.ok && r.value.total, 50);
  } finally {
    env.cleanup();
  }
});

matrix("month shows only the caller's account and only the current month", async (database) => {
  const env = await makeTestPorts({ database });
  try {
    const ada = accountOf(env.principals.ada);
    await runStrip(record, env.ports, hit(ada, "me.get", "ok"));
    await runStrip(record, env.ports, hit(accountOf(env.principals.grace), "me.get", "ok", "other"));
    env.clock.advance(8 * DAY); // 2026-12-01
    await runStrip(record, env.ports, hit(ada, "me.get", "ok"));
    const december = await runStrip(month, env.ports, { principal: env.principals.ada });
    assert.deepEqual(december.ok && [december.value.month, december.value.total], ["2026-12", 1]);
    const grace = await runStrip(month, env.ports, { principal: env.principals.grace });
    assert.deepEqual(grace.ok && grace.value.total, 0, "grace used nothing in December");
  } finally {
    env.cleanup();
  }
});

matrix("month for an anonymous caller is a toast, and an account with no usage has total 0", async (database) => {
  const env = await makeTestPorts({ database });
  try {
    const anon = await runStrip(month, env.ports, { principal: { kind: "anonymous", ip: "1.1.1.1" } });
    assert.equal(anon.ok, false);
    if (!anon.ok) assert.equal(anon.display.type, "toast");
    const none = await runStrip(month, env.ports, { principal: env.principals.ada });
    assert.deepEqual(none.ok && none.value, { month: "2026-11", total: 0, byEndpoint: [] });
  } finally {
    env.cleanup();
  }
});

matrix("a key principal sees its account's usage", async (database) => {
  const env = await makeTestPorts({ database });
  try {
    const a = accountOf(env.principals.ada);
    await runStrip(record, env.ports, hit(a, "me.get", "ok", "key9"));
    const byKey: Principal = { kind: "key", accountId: a, keyId: "key9", role: "user" };
    const r = await runStrip(month, env.ports, { principal: byKey });
    assert.equal(r.ok && r.value.total, 1);
  } finally {
    env.cleanup();
  }
});

test("usage strips: neither is sensitive, and record's budget is one collection", () => {
  assert.deepEqual([record.sensitive, month.sensitive], [false, false]);
  assert.deepEqual(record.budget, { reads: ["usage_counters"], writes: ["usage_counters"], storage: [] });
});
