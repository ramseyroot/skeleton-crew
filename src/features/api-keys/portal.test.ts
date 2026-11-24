import assert from "node:assert/strict";
import { test } from "node:test";
import { DATABASE_KINDS, makeTestPorts } from "./testing.ts";
import { runKeyIntent } from "./portal.ts";
import { KEY_PATTERN } from "./keygen.ts";

const form = (fields: Record<string, string>): FormData => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

for (const database of DATABASE_KINDS) {
  test(`runKeyIntent [db ${database}]: create, rotate and revoke through the form`, async () => {
    const { ports, principals, cleanup } = await makeTestPorts({ database });
    try {
      const created = await runKeyIntent(ports, principals.ada, form({ intent: "create", name: "web", expiresInDays: "" }));
      assert.equal(created.ok, true);
      if (!created.ok || created.value.kind !== "created") throw new Error("expected created");
      assert.match(created.value.key.key, KEY_PATTERN);
      const rotated = await runKeyIntent(ports, principals.ada, form({ intent: "rotate", keyId: created.value.key.id }));
      assert.equal(rotated.ok && rotated.value.kind, "rotated");
      if (!rotated.ok || rotated.value.kind !== "rotated") throw new Error("expected rotated");
      assert.equal(rotated.value.replacedId, created.value.key.id);
      const revoked = await runKeyIntent(ports, principals.ada, form({ intent: "revoke", keyId: rotated.value.key.id }));
      assert.deepEqual(revoked.ok && revoked.value, { kind: "revoked", id: rotated.value.key.id });
    } finally {
      cleanup();
    }
  });

  test(`runKeyIntent [db ${database}]: a failure is a public result without the StepError, and an unknown intent is generic`, async () => {
    const { ports, principals, cleanup } = await makeTestPorts({ database });
    try {
      const bad = await runKeyIntent(ports, principals.ada, form({ intent: "create", name: "" }));
      assert.equal(bad.ok, false);
      if (!bad.ok) {
        assert.deepEqual(bad.display, { type: "toast", message: "Give the key a name of 1 to 60 characters." });
        assert.equal("error" in bad, false);
      }
      const unknown = await runKeyIntent(ports, principals.ada, form({ intent: "delete-everything" }));
      assert.equal(unknown.ok, false);
      if (!unknown.ok) assert.equal(unknown.display.type, "generic");
    } finally {
      cleanup();
    }
  });
}
