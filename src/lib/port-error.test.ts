import assert from "node:assert/strict";
import { test } from "node:test";
import { isPortError, portError } from "./port-error.ts";

test("a port error names the adapter and has no strip yet", () => {
  const e = portError("conflict", "database/sqlite", "duplicate id", { cause: new Error("UNIQUE") });
  assert.equal(e.kind, "conflict");
  assert.equal(e.step, "adapter:database/sqlite");
  assert.equal(e.stripId, "");
  assert.equal(e.audience, "internal");
  assert.equal(isPortError(e), true);
});

test("an error built by a step is not a port error", () => {
  const e = { ...portError("conflict", "x/y", "m"), step: "db.user.create" };
  assert.equal(isPortError(e), false);
});
