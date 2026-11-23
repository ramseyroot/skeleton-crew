import assert from "node:assert/strict";
import { test } from "node:test";
import { makeTestPorts } from "../../test-utils/ports.ts";
import { parseProfileForm } from "./profile.parseForm.ts";

const cases: [string, string, string | null][] = [
  ["Ada", "Ada", null],
  ["  Ada Lovelace  ", "Ada Lovelace", null],
  ["x".repeat(60), "x".repeat(60), null],
  ["", "", "Please enter a name between 1 and 60 characters."],
  ["   ", "", "Please enter a name between 1 and 60 characters."],
  ["x".repeat(61), "", "Please enter a name between 1 and 60 characters."],
];

for (const [raw, trimmed, message] of cases) {
  test(`pure.profile.parseForm: ${JSON.stringify(raw.length > 20 ? `${raw.slice(0, 10)}... (${raw.length})` : raw)}`, async () => {
    const { ports } = await makeTestPorts();
    const r = await parseProfileForm.execute({ userId: "u1", displayName: raw }, { stripId: "s", ports });
    if (message === null) {
      assert.deepEqual(r, { ok: true, value: { userId: "u1", displayName: trimmed } });
    } else {
      assert.equal(r.ok, false);
      if (!r.ok) {
        assert.equal(r.error.kind, "validation");
        assert.equal(r.error.audience, "user");
        assert.equal(r.error.userMessage, message);
        assert.equal(r.error.step, "pure.profile.parseForm");
      }
    }
  });
}

test("pure.profile.parseForm: a missing user id is rejected by the input schema", async () => {
  const { ports } = await makeTestPorts();
  const r = await parseProfileForm.execute({ userId: "", displayName: "Ada" }, { stripId: "s", ports });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.audience, "internal");
});
