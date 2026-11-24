import assert from "node:assert/strict";
import { test } from "node:test";
import { makeTestPorts } from "../../testing.ts";
import { summarizeUsage } from "./usage.summarize.ts";

test("pure.usage.summarize: adds days up per endpoint, sorted by endpoint name", async () => {
  const { ports, cleanup } = await makeTestPorts();
  try {
    const r = await summarizeUsage.execute(
      {
        month: "2026-11",
        rows: [
          { endpoint: "b", day: "2026-11-01", ok: 2, clientError: 1, serverError: 0 },
          { endpoint: "a", day: "2026-11-01", ok: 1, clientError: 0, serverError: 0 },
          { endpoint: "b", day: "2026-11-02", ok: 3, clientError: 0, serverError: 2 },
        ],
      },
      { stripId: "s", ports },
    );
    assert.deepEqual(r, {
      ok: true,
      value: {
        month: "2026-11",
        total: 9,
        byEndpoint: [
          { endpoint: "a", ok: 1, clientError: 0, serverError: 0, total: 1 },
          { endpoint: "b", ok: 5, clientError: 1, serverError: 2, total: 8 },
        ],
      },
    });
  } finally {
    cleanup();
  }
});

test("pure.usage.summarize: no rows gives total 0", async () => {
  const { ports, cleanup } = await makeTestPorts();
  try {
    const r = await summarizeUsage.execute({ month: "2026-11", rows: [] }, { stripId: "s", ports });
    assert.deepEqual(r, { ok: true, value: { month: "2026-11", total: 0, byEndpoint: [] } });
  } finally {
    cleanup();
  }
});
