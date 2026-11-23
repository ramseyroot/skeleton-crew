import assert from "node:assert/strict";
import { test } from "node:test";
import { runIdsContract } from "../contract.test.ts";
import { errorMap } from "./errors.ts";
import { createUuidIds } from "./index.ts";

runIdsContract("ids/uuid", createUuidIds);

test("ids/uuid: IDs look like UUIDs", () => {
  assert.match(createUuidIds().next(), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

test("ids/uuid: unmapped failures are unexpected", () => {
  assert.equal(errorMap.map(new Error("x")), "unexpected");
});
