// Contract suite for the IdGenerator port.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { IdGenerator } from "../../ports/ids.ts";

export function runIdsContract(name: string, make: () => IdGenerator): void {
  test(`${name}: next() returns a non-empty string`, () => {
    const id = make().next();
    assert.equal(typeof id, "string");
    assert.ok(id.length > 0);
  });

  test(`${name}: IDs are unique`, () => {
    const ids = make();
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(ids.next());
    assert.equal(seen.size, 2000);
  });

  test(`${name}: IDs are safe in a key (no whitespace or colon)`, () => {
    const id = make().next();
    assert.doesNotMatch(id, /[\s:]/);
  });
}
