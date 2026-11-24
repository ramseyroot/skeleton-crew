import assert from "node:assert/strict";
import { test } from "node:test";
import { createSequenceIds } from "../../adapters/ids/sequence/index.ts";
import { createUuidIds } from "../../adapters/ids/uuid/index.ts";
import { KEY_PATTERN, generateKey, hashKey, prefixOf } from "./keygen.ts";

test("generateKey: the key has the form sk_<8>_<48>, letters and digits only", () => {
  for (const ids of [createSequenceIds("key"), createUuidIds()]) {
    const { prefix, key } = generateKey(ids);
    assert.match(key, KEY_PATTERN);
    assert.equal(prefix.length, 8);
    assert.equal(prefixOf(key), prefix);
  }
});

test("generateKey: two keys from real ids differ in prefix and in secret", () => {
  const ids = createUuidIds();
  const a = generateKey(ids);
  const b = generateKey(ids);
  assert.notEqual(a.prefix, b.prefix);
  assert.notEqual(a.key, b.key);
});

test("hashKey: a known SHA-256 value, and it differs for a changed key", () => {
  assert.equal(hashKey("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.notEqual(hashKey("sk_a_b"), hashKey("sk_a_c"));
});

test("prefixOf: a malformed key has no prefix", () => {
  for (const bad of ["", "sk_short_x", "pk_12345678_" + "a".repeat(48), "sk_12345678_" + "a".repeat(47), "sk_12345678_" + "a".repeat(49), "sk_1234567!_" + "a".repeat(48)]) {
    assert.equal(prefixOf(bad), null, bad);
  }
});
