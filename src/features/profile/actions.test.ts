import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { saveProfileAction } from "./actions.ts";
import { profileFeature } from "./feature.ts";
import { getRuntime, resetRuntime } from "../../app/runtime.ts";

const tmp = mkdtempSync(join(tmpdir(), "skel-actions-"));
const saved: Record<string, string | undefined> = {};
const KEYS = ["APP_ENV", "APP_SEED", "DATABASE_PATH", "STORAGE_PATH"];

before(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  process.env.APP_ENV = "dev";
  process.env.APP_SEED = "1";
  process.env.DATABASE_PATH = join(tmp, "actions.db");
  process.env.STORAGE_PATH = join(tmp, "files");
  // This feature's own list, so the test still runs while the feature is disabled in the app.
  resetRuntime([profileFeature]);
});
after(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetRuntime();
  rmSync(tmp, { recursive: true, force: true });
});

const form = (fields: Record<string, string>): FormData => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};

test("the action saves a name and returns a public result", async () => {
  const r = await saveProfileAction(null, form({ userId: "u1", displayName: "  Ada L. " }));
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value, { userId: "u1", displayName: "Ada L." });
  const rt = await getRuntime();
  const stored = await rt.ports.database.read("users").get("u1");
  assert.equal(stored.ok && stored.value?.displayName, "Ada L.");
});

test("a user error comes back as a toast display and carries no error object", async () => {
  const empty = await saveProfileAction(null, form({ userId: "u1", displayName: "   " }));
  assert.equal(empty.ok, false);
  if (!empty.ok) {
    assert.deepEqual(empty.display, { type: "toast", message: "Please enter a name between 1 and 60 characters." });
    assert.equal("error" in empty, false);
  }
  const taken = await saveProfileAction(null, form({ userId: "u1", displayName: "GRACE" }));
  assert.equal(taken.ok === false && taken.display.type, "toast");
});

test("an internal error comes back generic, with a reference, and nothing else leaks", async () => {
  const r = await saveProfileAction(null, form({ userId: "ghost", displayName: "Nobody" }));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.deepEqual(r.display, { type: "generic", reference: r.stripId });
    const wire = JSON.stringify(r);
    assert.equal(wire.includes("not_found"), false);
    assert.equal(wire.includes("db.user.setDisplayName"), false);
  }
});

test("missing form fields are a validation toast, not a crash", async () => {
  const r = await saveProfileAction(null, new FormData());
  assert.equal(r.ok, false);
});

test("the result survives JSON, as a Server Action result must", async () => {
  const r = await saveProfileAction(null, form({ userId: "u2", displayName: "Grace H." }));
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r);
});
