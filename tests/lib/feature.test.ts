import assert from "node:assert/strict";
import { test } from "node:test";
import { assertDistinctCollections, defineFeature } from "../../src/lib/feature.ts";

const users = { name: "users", fields: { displayName: { type: "string" as const } } };

test("a valid feature module is returned as it is", () => {
  const f = { name: "profile", collections: [users] };
  assert.equal(defineFeature(f), f);
});

test("a bad feature name fails when the module is defined", () => {
  for (const name of ["", "Profile", "my_feature", "1abc", "a b"]) {
    assert.throws(() => defineFeature({ name, collections: [] }), /not a valid feature name/, name);
  }
  assert.doesNotThrow(() => defineFeature({ name: "api-keys", collections: [] }));
});

test("a collection listed twice in one feature is rejected", () => {
  assert.throws(() => defineFeature({ name: "profile", collections: [users, users] }), /listed twice/);
});

test("two features cannot declare the same collection", () => {
  const a = defineFeature({ name: "profile", collections: [users] });
  const b = defineFeature({ name: "account", collections: [users] });
  assert.throws(() => assertDistinctCollections([a, b]), /"profile" and "account" both declare the collection "users"/);
  assert.doesNotThrow(() => assertDistinctCollections([a, defineFeature({ name: "orders", collections: [{ name: "orders", fields: {} }] })]));
});
