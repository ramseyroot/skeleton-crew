import assert from "node:assert/strict";
import { test } from "node:test";
import { runStrip } from "../../../lib/strip.ts";
import { makeError } from "../../../lib/result.ts";
import type { Principal } from "../../../lib/principal.ts";
import type { Ports } from "../../../lib/step.ts";
import { DATABASE_KINDS, makeTestPorts } from "../testing.ts";
import type { DatabaseKind } from "../testing.ts";
import { KEY_PATTERN, hashKey } from "../keygen.ts";
import { KEY_ERROR_MESSAGE } from "../domain.ts";
import { createApiKey } from "./keys.create.strip.ts";
import { listApiKeys } from "./keys.list.strip.ts";
import { revokeApiKey } from "./keys.revoke.strip.ts";
import { rotateApiKey } from "./keys.rotate.strip.ts";
import { verifyApiKey } from "./keys.verify.strip.ts";

function matrix(name: string, body: (database: DatabaseKind) => Promise<void>) {
  for (const database of DATABASE_KINDS) test(`keys strips [db ${database}]: ${name}`, () => body(database));
}

async function made(ports: Ports, principal: Principal, name = "CI", expiresInDays: number | null = null) {
  const r = await runStrip(createApiKey, ports, { principal, name, expiresInDays });
  if (!r.ok) throw new Error(`create failed: ${r.error.kind}`);
  return r.value;
}

const DAY = 24 * 60 * 60 * 1000;
const anonymous: Principal = { kind: "anonymous", ip: "10.0.0.1" };

matrix("create returns the key once and stores only its hash and prefix", async (database) => {
  const { ports, principals, cleanup } = await makeTestPorts({ database });
  try {
    const k = await made(ports, principals.ada, " CI server ", 30);
    assert.match(k.key, KEY_PATTERN);
    assert.equal(k.name, "CI server");
    assert.equal(k.expiresAt, new Date(Date.parse("2026-11-23T12:00:00.000Z") + 30 * DAY).toISOString());
    const stored = await ports.database.read("api_keys").get(k.id);
    assert.equal(stored.ok && stored.value?.keyHash, hashKey(k.key));
    assert.equal(stored.ok && stored.value?.prefix, k.prefix);
    assert.equal(JSON.stringify(stored).includes(k.key), false, "the key itself is never stored");
    assert.equal(stored.ok && stored.value?.accountId, principals.ada.kind === "user" ? principals.ada.accountId : "");
  } finally {
    cleanup();
  }
});

matrix("create: a bad name, a bad expiry or no sign-in is a toast, and nothing is written", async (database) => {
  const { ports, principals, cleanup } = await makeTestPorts({ database });
  try {
    const cases: [Principal, string, number | null, string][] = [
      [principals.ada, "   ", null, "Give the key a name of 1 to 60 characters."],
      [principals.ada, "x".repeat(61), null, "Give the key a name of 1 to 60 characters."],
      [principals.ada, "ok", 0, "Choose an expiry between 1 and 365 days, or none."],
      [principals.ada, "ok", 366, "Choose an expiry between 1 and 365 days, or none."],
      [principals.ada, "ok", 1.5, "Choose an expiry between 1 and 365 days, or none."],
      [anonymous, "ok", null, "You need to sign in, or send a valid API key."],
    ];
    for (const [principal, name, days, message] of cases) {
      const r = await runStrip(createApiKey, ports, { principal, name, expiresInDays: days });
      assert.equal(r.ok, false, `${name}/${days}`);
      if (!r.ok) assert.deepEqual(r.display, { type: "toast", message });
    }
    const all = await ports.database.read("api_keys").list();
    assert.equal(all.ok && all.value.items.length, 0);
  } finally {
    cleanup();
  }
});

matrix("list shows only the caller's keys, newest first, with states, and never a key", async (database) => {
  const { ports, principals, clock, cleanup } = await makeTestPorts({ database });
  try {
    const first = await made(ports, principals.ada, "first", 1);
    clock.advance(1000);
    const second = await made(ports, principals.ada, "second");
    clock.advance(1000);
    const third = await made(ports, principals.ada, "third");
    await made(ports, principals.grace, "not ada's");
    await runStrip(revokeApiKey, ports, { principal: principals.ada, keyId: third.id });
    clock.advance(2 * DAY);
    const r = await runStrip(listApiKeys, ports, { principal: principals.ada });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.value.keys.map((k) => [k.name, k.state]), [["third", "revoked"], ["second", "active"], ["first", "expired"]]);
    assert.equal(JSON.stringify(r.value).includes(first.key), false);
    assert.equal(JSON.stringify(r.value).includes(second.key), false);
  } finally {
    cleanup();
  }
});

matrix("list for an anonymous caller is a toast", async (database) => {
  const { ports, cleanup } = await makeTestPorts({ database });
  try {
    const r = await runStrip(listApiKeys, ports, { principal: anonymous });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.display.type, "toast");
  } finally {
    cleanup();
  }
});

matrix("verify accepts a good key, names its account and role, and records the last use", async (database) => {
  const { ports, principals, clock, cleanup } = await makeTestPorts({ database });
  try {
    const k = await made(ports, principals.ada);
    clock.advance(5000);
    const r = await runStrip(verifyApiKey, ports, { key: k.key });
    assert.deepEqual(r.ok && r.value, { keyId: k.id, accountId: principals.ada.kind === "user" ? principals.ada.accountId : "", role: "user" });
    const stored = await ports.database.read("api_keys").get(k.id);
    assert.equal(stored.ok && stored.value?.lastUsedAt, clock.now());
  } finally {
    cleanup();
  }
});

matrix("verify gives one identical error for a malformed, unknown, wrong, revoked or expired key", async (database) => {
  const { ports, principals, clock, cleanup } = await makeTestPorts({ database });
  try {
    const good = await made(ports, principals.ada, "good");
    const revoked = await made(ports, principals.ada, "revoked");
    const expiring = await made(ports, principals.ada, "expiring", 1);
    await runStrip(revokeApiKey, ports, { principal: principals.ada, keyId: revoked.id });
    clock.advance(2 * DAY);
    const wrongSecret = `sk_${good.prefix}_${"0".repeat(48)}`;
    const unknown = `sk_${"Z".repeat(8)}_${"1".repeat(48)}`;
    const errors = [];
    for (const key of ["", "garbage", unknown, wrongSecret, revoked.key, expiring.key]) {
      const r = await runStrip(verifyApiKey, ports, { key });
      assert.equal(r.ok, false, key);
      if (!r.ok) errors.push([r.error.kind, r.error.userMessage, r.display]);
    }
    for (const e of errors) assert.deepEqual(e, ["unauthorized", KEY_ERROR_MESSAGE, { type: "toast", message: KEY_ERROR_MESSAGE }]);
    const stillGood = await runStrip(verifyApiKey, ports, { key: good.key });
    assert.equal(stillGood.ok, true);
  } finally {
    cleanup();
  }
});

matrix("a failure to record the last use does not fail verify", async (database) => {
  const { ports, principals, cleanup } = await makeTestPorts({ database });
  try {
    const k = await made(ports, principals.ada);
    const real = ports.database.write("api_keys");
    const broken: Ports = {
      ...ports,
      database: {
        ...ports.database,
        write: () => ({ ...real, update: async () => ({ ok: false as const, error: makeError("unexpected", "adapter:test", "", "disk full") }) }),
      },
    };
    const r = await runStrip(verifyApiKey, broken, { key: k.key });
    assert.equal(r.ok, true);
  } finally {
    cleanup();
  }
});

matrix("a key of a removed account is rejected like any bad key", async (database) => {
  const { ports, principals, cleanup } = await makeTestPorts({ database });
  try {
    const k = await made(ports, principals.ada);
    const gone: Ports = { ...ports, auth: { ...ports.auth, getAccount: async () => ({ ok: false as const, error: makeError("not_found", "adapter:test", "", "no account") }) } };
    const r = await runStrip(verifyApiKey, gone, { key: k.key });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.userMessage, KEY_ERROR_MESSAGE);
  } finally {
    cleanup();
  }
});

matrix("revoke: the owner and an admin may, another user may not, and a second revoke keeps the first time", async (database) => {
  const { ports, principals, clock, cleanup } = await makeTestPorts({ database });
  try {
    const k = await made(ports, principals.ada);
    const stranger = await runStrip(revokeApiKey, ports, { principal: principals.grace, keyId: k.id });
    assert.equal(stranger.ok, false);
    if (!stranger.ok) {
      assert.equal(stranger.error.kind, "forbidden");
      assert.deepEqual(stranger.display, { type: "toast", message: "You do not have access to this." });
    }
    assert.equal((await runStrip(verifyApiKey, ports, { key: k.key })).ok, true, "a refused revoke changes nothing");
    const first = await runStrip(revokeApiKey, ports, { principal: principals.ada, keyId: k.id });
    assert.equal(first.ok, true);
    clock.advance(1000);
    const again = await runStrip(revokeApiKey, ports, { principal: principals.root, keyId: k.id });
    assert.deepEqual(again.ok && again.value, first.ok && first.value);
    assert.equal((await runStrip(verifyApiKey, ports, { key: k.key })).ok, false);
  } finally {
    cleanup();
  }
});

matrix("revoke of an unknown key is an internal not_found", async (database) => {
  const { ports, principals, cleanup } = await makeTestPorts({ database });
  try {
    const r = await runStrip(revokeApiKey, ports, { principal: principals.ada, keyId: "ghost" });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error.kind, "not_found");
      assert.equal(r.display.type, "generic");
    }
  } finally {
    cleanup();
  }
});

matrix("rotate makes a working key with the same name and expiry, and revokes the old one", async (database) => {
  const { ports, principals, cleanup } = await makeTestPorts({ database });
  try {
    const old = await made(ports, principals.ada, "deploy", 30);
    const r = await runStrip(rotateApiKey, ports, { principal: principals.ada, keyId: old.id });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.replacedId, old.id);
    assert.equal(r.value.name, "deploy");
    assert.equal(r.value.expiresAt, old.expiresAt);
    assert.notEqual(r.value.key, old.key);
    assert.equal((await runStrip(verifyApiKey, ports, { key: r.value.key })).ok, true);
    assert.equal((await runStrip(verifyApiKey, ports, { key: old.key })).ok, false);
  } finally {
    cleanup();
  }
});

matrix("rotate: someone else's key is forbidden, a revoked key is a conflict toast, and nothing changes", async (database) => {
  const { ports, principals, cleanup } = await makeTestPorts({ database });
  try {
    const k = await made(ports, principals.ada);
    const stranger = await runStrip(rotateApiKey, ports, { principal: principals.grace, keyId: k.id });
    assert.equal(stranger.ok, false);
    if (!stranger.ok) assert.equal(stranger.error.kind, "forbidden");
    await runStrip(revokeApiKey, ports, { principal: principals.ada, keyId: k.id });
    const r = await runStrip(rotateApiKey, ports, { principal: principals.ada, keyId: k.id });
    assert.equal(r.ok, false);
    if (!r.ok) assert.deepEqual(r.display, { type: "toast", message: "Only an active key can be rotated. Create a new key instead." });
    const list = await runStrip(listApiKeys, ports, { principal: principals.ada });
    assert.equal(list.ok && list.value.keys.length, 1, "no new key was created");
  } finally {
    cleanup();
  }
});

matrix("rotate is atomic: if the batch fails the old key still works and no key is added", async (database) => {
  const { ports, principals, cleanup } = await makeTestPorts({ database });
  try {
    const k = await made(ports, principals.ada);
    const failing: Ports = { ...ports, database: { ...ports.database, batch: async () => ({ ok: false as const, error: makeError("unexpected", "adapter:test", "", "boom") }) } };
    const r = await runStrip(rotateApiKey, failing, { principal: principals.ada, keyId: k.id });
    assert.equal(r.ok, false);
    assert.equal((await runStrip(verifyApiKey, ports, { key: k.key })).ok, true);
    const all = await ports.database.read("api_keys").list();
    assert.equal(all.ok && all.value.items.length, 1);
  } finally {
    cleanup();
  }
});

// Requirement 3.5 and 12.3: a known key goes through every strip, and no log line, report or metric holds it.
matrix("no full key reaches the logger, the reporter or the metrics", async (database) => {
  const { ports, principals, logger, reporter, metrics, cleanup } = await makeTestPorts({ database });
  try {
    const a = await made(ports, principals.ada, "a");
    const b = await made(ports, principals.ada, "b");
    await runStrip(verifyApiKey, ports, { key: a.key });
    await runStrip(verifyApiKey, ports, { key: `sk_${a.prefix}_${"9".repeat(48)}` });
    await runStrip(verifyApiKey, ports, { key: "sk_bad" });
    const rotated = await runStrip(rotateApiKey, ports, { principal: principals.ada, keyId: b.id });
    await runStrip(rotateApiKey, ports, { principal: principals.ada, keyId: b.id }); // an error after the rotation
    await runStrip(listApiKeys, ports, { principal: principals.ada });
    await runStrip(revokeApiKey, ports, { principal: principals.ada, keyId: a.id });
    await runStrip(verifyApiKey, ports, { key: a.key }); // a revoked key, as input of a failing strip
    const everything = JSON.stringify([logger.entries, reporter.reports, metrics.points]);
    assert.ok(everything.length > 100, "something was recorded, so the check is not empty");
    const secrets = [a.key, b.key, rotated.ok ? rotated.value.key : "", a.key.split("_")[2], b.key.split("_")[2]];
    for (const s of secrets) assert.ok(s && !everything.includes(s), `a key or secret is in a log, report or metric: ${s?.slice(0, 12)}`);
  } finally {
    cleanup();
  }
});

test("keys strips: the ones that handle a key are sensitive, the others are not", () => {
  assert.deepEqual(
    [createApiKey, verifyApiKey, rotateApiKey, listApiKeys, revokeApiKey].map((s) => [s.name, s.sensitive]),
    [["keys.create", true], ["keys.verify", true], ["keys.rotate", true], ["keys.list", false], ["keys.revoke", false]],
  );
});
