import assert from "node:assert/strict";
import { test } from "node:test";
import { runIdsContract } from "../contract.test.ts";
import { errorMap } from "./errors.ts";
import { createSequenceIds } from "./index.ts";

runIdsContract("ids/sequence", () => createSequenceIds());

test("ids/sequence: IDs are predictable", () => {
  const ids = createSequenceIds("user");
  assert.deepEqual([ids.next(), ids.next(), ids.next()], ["user-1", "user-2", "user-3"]);
});

test("ids/sequence: unmapped failures are unexpected", () => {
  assert.equal(errorMap.map(new Error("x")), "unexpected");
});
