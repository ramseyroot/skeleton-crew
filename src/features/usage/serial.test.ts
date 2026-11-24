import assert from "node:assert/strict";
import { test } from "node:test";
import { serialized } from "./serial.ts";

test("serialized: jobs with the same key run one after another", async () => {
  const log: string[] = [];
  const job = (name: string, ms: number) => async () => {
    log.push(`${name} start`);
    await new Promise((r) => setTimeout(r, ms));
    log.push(`${name} end`);
    return name;
  };
  const out = await Promise.all([serialized("k", job("a", 20)), serialized("k", job("b", 1)), serialized("other", job("c", 1))]);
  assert.deepEqual(out, ["a", "b", "c"]);
  assert.ok(log.indexOf("a end") < log.indexOf("b start"), "b waited for a");
});

test("serialized: a failing job does not block the next one, and its error reaches its own caller", async () => {
  const failed = serialized("k2", async () => {
    throw new Error("boom");
  });
  const next = serialized("k2", async () => "fine");
  await assert.rejects(failed, /boom/);
  assert.equal(await next, "fine");
});
