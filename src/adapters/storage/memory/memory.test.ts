import assert from "node:assert/strict";
import { test } from "node:test";
import { runStorageContract } from "../contract.test.ts";
import { errorMap } from "./errors.ts";
import { createMemoryStorage } from "./index.ts";

runStorageContract("storage/memory", () => ({ storage: createMemoryStorage() }));

test("storage/memory: two instances do not share objects", async () => {
  const a = createMemoryStorage();
  const b = createMemoryStorage();
  await a.put("k", new Uint8Array([1]), { contentType: "t/t" });
  assert.deepEqual(await b.get("k"), { ok: true, value: null });
  assert.equal(a.name, "memory");
});

test("storage/memory: unmapped failures are unexpected", () => {
  assert.equal(errorMap.map(new Error("x")), "unexpected");
});
