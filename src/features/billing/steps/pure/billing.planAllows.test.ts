import assert from "node:assert/strict";
import { test } from "node:test";
import { makeTestPorts } from "../../testing.ts";
import { planAllows } from "./billing.planAllows.ts";

for (const [features, feature, allowed] of [
  [["basic"], "basic", true],
  [["basic"], "advanced", false],
  [[], "basic", false],
  [["basic", "advanced"], "advanced", true],
] as const) {
  test(`pure.billing.planAllows: ${JSON.stringify(features)} and "${feature}" is ${allowed}`, async () => {
    const { ports, cleanup } = await makeTestPorts();
    try {
      const r = await planAllows.execute({ features: [...features], feature }, { stripId: "s", ports });
      assert.deepEqual(r, { ok: true, value: { allowed } });
    } finally {
      cleanup();
    }
  });
}
