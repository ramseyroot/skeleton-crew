import assert from "node:assert/strict";
import { test } from "node:test";
import { makeTestPorts } from "../../testing.ts";
import { parseKeyCreate } from "./keys.parseCreate.ts";

test("pure.keys.parseCreate: trims the name and turns a missing expiry into null", async () => {
  const { ports, principals } = await makeTestPorts();
  const r = await parseKeyCreate.execute({ principal: principals.ada, name: "  CI  " }, { stripId: "s", ports });
  assert.deepEqual(r, { ok: true, value: { principal: principals.ada, name: "CI", expiresInDays: null } });
});

test("pure.keys.parseCreate: the limits of the name and of the expiry are inclusive", async () => {
  const { ports, principals } = await makeTestPorts();
  for (const [name, days] of [["x", 1], ["x".repeat(60), 365]] as const) {
    const r = await parseKeyCreate.execute({ principal: principals.ada, name, expiresInDays: days }, { stripId: "s", ports });
    assert.equal(r.ok, true, `${name.length} characters, ${days} days`);
  }
});

test("pure.keys.parseCreate: an anonymous principal is unauthorized with a user message", async () => {
  const { ports } = await makeTestPorts();
  const r = await parseKeyCreate.execute({ principal: { kind: "anonymous", ip: "1.1.1.1" }, name: "x" }, { stripId: "s", ports });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.error.kind, "unauthorized");
    assert.equal(r.error.audience, "user");
  }
});
