// Contract suite for the ObjectStorage port. Each adapter's test file calls runStorageContract with a factory
// that returns a fresh, empty storage and an optional cleanup.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { ObjectStorage } from "../../ports/storage.ts";

export type StorageHarness = { storage: ObjectStorage; cleanup?: () => void };
export type MakeStorage = () => StorageHarness;

const bytes = (...n: number[]) => new Uint8Array(n);
const BAD_KEYS: [string, string][] = [
  ["", "empty"],
  ["a".repeat(1025), "too long"],
  ["/a", "leading slash"],
  ["a\\b", "backslash"],
  ["a\0b", "NUL"],
  ["a//b", "empty segment"],
  ["a/", "trailing slash"],
  ["./a", "dot segment"],
  ["a/./b", "dot segment inside"],
  ["../a", "dot-dot segment"],
  ["a/../b", "dot-dot segment inside"],
  ["a/..", "dot-dot last"],
  [".meta", "reserved .meta"],
  [".meta/x", "reserved .meta folder"],
  ["meta__", "reserved meta__"],
  ["meta__/x", "reserved meta__ folder"],
];

/** Runs `body` with a fresh storage and always cleans up. */
function withStorage(make: MakeStorage, body: (s: ObjectStorage) => Promise<void>): () => Promise<void> {
  return async () => {
    const h = make();
    try {
      await body(h.storage);
    } finally {
      h.cleanup?.();
    }
  };
}

function unwrap<T>(res: { ok: true; value: T } | { ok: false; error: { kind: string; message: string } }): T {
  assert.equal(res.ok, true, res.ok ? "" : `${res.error.kind}: ${res.error.message}`);
  return (res as { ok: true; value: T }).value;
}

export function runStorageContract(name: string, make: MakeStorage): void {
  test(`${name}: put then get returns the bytes, type and size`, withStorage(make, async (s) => {
    const meta = unwrap(await s.put("docs/a.txt", bytes(1, 2, 3), { contentType: "text/plain" }));
    assert.deepEqual(meta, { key: "docs/a.txt", contentType: "text/plain", size: 3 });
    const got = unwrap(await s.get("docs/a.txt"));
    assert.deepEqual(got, { key: "docs/a.txt", contentType: "text/plain", size: 3, bytes: bytes(1, 2, 3) });
  }));

  test(`${name}: an empty object and unicode keys work`, withStorage(make, async (s) => {
    unwrap(await s.put("empty", new Uint8Array(0), { contentType: "application/octet-stream" }));
    assert.equal(unwrap(await s.get("empty"))?.size, 0);
    unwrap(await s.put("naïve/日本.txt", bytes(9), { contentType: "text/plain" }));
    assert.deepEqual(unwrap(await s.get("naïve/日本.txt"))?.bytes, bytes(9));
    assert.equal(unwrap(await s.list("naïve/")).items.length, 1);
    const longest = `${"k".repeat(100)}/`.repeat(9).concat("k".repeat(115)); // 1024 chars, segments short enough for a file system
    assert.equal(longest.length, 1024);
    unwrap(await s.put(longest, bytes(1), { contentType: "x/y" }));
    assert.equal(unwrap(await s.get(longest))?.size, 1);
  }));

  test(`${name}: keys that only look reserved are allowed`, withStorage(make, async (s) => {
    for (const key of [".metadata/x", "meta", "meta_/x", "a/.meta", "a/meta__"]) {
      unwrap(await s.put(key, bytes(1), { contentType: "x/y" }));
      assert.equal(unwrap(await s.get(key))?.key, key);
    }
  }));

  test(`${name}: get of a missing key is ok(null)`, withStorage(make, async (s) => {
    assert.equal(unwrap(await s.get("nope")), null);
    assert.equal(unwrap(await s.get("nope/deeper")), null);
  }));

  test(`${name}: put overwrites bytes and content type`, withStorage(make, async (s) => {
    unwrap(await s.put("k", bytes(1, 2, 3), { contentType: "a/a" }));
    unwrap(await s.put("k", bytes(4), { contentType: "b/b" }));
    assert.deepEqual(unwrap(await s.get("k")), { key: "k", contentType: "b/b", size: 1, bytes: bytes(4) });
    assert.equal(unwrap(await s.list("")).items.length, 1);
  }));

  test(`${name}: delete removes an object and succeeds on a missing key`, withStorage(make, async (s) => {
    unwrap(await s.put("k", bytes(1), { contentType: "a/a" }));
    unwrap(await s.delete("k"));
    assert.equal(unwrap(await s.get("k")), null);
    unwrap(await s.delete("k"));
    unwrap(await s.delete("never/existed"));
    assert.deepEqual(unwrap(await s.list("")).items, []);
  }));

  test(`${name}: bytes are copied on put and on get`, withStorage(make, async (s) => {
    const input = bytes(1, 2, 3);
    unwrap(await s.put("k", input, { contentType: "a/a" }));
    input[0] = 99;
    const first = unwrap(await s.get("k"));
    assert.deepEqual(first?.bytes, bytes(1, 2, 3));
    first?.bytes.fill(7);
    assert.deepEqual(unwrap(await s.get("k"))?.bytes, bytes(1, 2, 3));
  }));

  test(`${name}: invalid keys are validation errors for get, put and delete`, withStorage(make, async (s) => {
    for (const [key, why] of BAD_KEYS) {
      for (const [op, res] of [
        ["get", await s.get(key)],
        ["put", await s.put(key, bytes(1), { contentType: "a/a" })],
        ["delete", await s.delete(key)],
      ] as const) {
        assert.equal(res.ok, false, `${op} ${why}`);
        if (!res.ok) {
          assert.equal(res.error.kind, "validation", `${op} ${why}`);
          assert.match(res.error.step, /^adapter:storage\//);
        }
      }
    }
    assert.deepEqual(unwrap(await s.list("")).items, []);
  }));

  test(`${name}: put rejects an empty content type`, withStorage(make, async (s) => {
    const res = await s.put("k", bytes(1), { contentType: "" });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.error.kind, "validation");
  }));

  test(`${name}: list filters by prefix and orders by key`, withStorage(make, async (s) => {
    for (const key of ["b/2", "a/2", "a/10", "ab", "a/1", "c"]) {
      unwrap(await s.put(key, bytes(1), { contentType: "t/t" }));
    }
    const keys = async (prefix: string) => unwrap(await s.list(prefix)).items.map((i) => i.key);
    assert.deepEqual(await keys(""), ["a/1", "a/10", "a/2", "ab", "b/2", "c"]);
    assert.deepEqual(await keys("a/"), ["a/1", "a/10", "a/2"]);
    assert.deepEqual(await keys("a"), ["a/1", "a/10", "a/2", "ab"]);
    assert.deepEqual(await keys("a/1"), ["a/1", "a/10"]);
    assert.deepEqual(await keys("zzz"), []);
    const page = unwrap(await s.list("b/"));
    assert.deepEqual(page, { items: [{ key: "b/2", contentType: "t/t", size: 1 }], nextCursor: null });
  }));

  test(`${name}: list pages with an opaque cursor and a limit`, withStorage(make, async (s) => {
    const all = Array.from({ length: 7 }, (_, i) => `p/${String(i).padStart(2, "0")}`);
    for (const key of [...all].reverse()) unwrap(await s.put(key, bytes(1), { contentType: "t/t" }));
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    for (;;) {
      const page = unwrap(await s.list("p/", cursor === undefined ? { limit: 3 } : { limit: 3, cursor }));
      pages += 1;
      assert.ok(page.items.length <= 3);
      seen.push(...page.items.map((i) => i.key));
      if (page.nextCursor === null) break;
      assert.equal(typeof page.nextCursor, "string");
      cursor = page.nextCursor;
    }
    assert.equal(pages, 3);
    assert.deepEqual(seen, all);
  }));

  test(`${name}: a page that ends exactly at the last item has no next cursor`, withStorage(make, async (s) => {
    for (const key of ["a", "b"]) unwrap(await s.put(key, bytes(1), { contentType: "t/t" }));
    const page = unwrap(await s.list("", { limit: 2 }));
    assert.equal(page.items.length, 2);
    assert.equal(page.nextCursor, null);
  }));

  test(`${name}: the cursor survives objects added or removed between pages`, withStorage(make, async (s) => {
    for (const key of ["a", "b", "c"]) unwrap(await s.put(key, bytes(1), { contentType: "t/t" }));
    const first = unwrap(await s.list("", { limit: 1 }));
    assert.deepEqual(first.items.map((i) => i.key), ["a"]);
    unwrap(await s.delete("a"));
    unwrap(await s.put("bb", bytes(1), { contentType: "t/t" }));
    const second = unwrap(await s.list("", { limit: 10, ...(first.nextCursor ? { cursor: first.nextCursor } : {}) }));
    assert.deepEqual(second.items.map((i) => i.key), ["b", "bb", "c"]);
  }));

  test(`${name}: list limit defaults to 100 and must be 1..1000`, withStorage(make, async (s) => {
    for (let i = 0; i < 101; i++) unwrap(await s.put(`k${String(i).padStart(3, "0")}`, bytes(1), { contentType: "t/t" }));
    const page = unwrap(await s.list(""));
    assert.equal(page.items.length, 100);
    assert.notEqual(page.nextCursor, null);
    assert.equal(unwrap(await s.list("", { limit: 1000 })).items.length, 101);
    assert.equal(unwrap(await s.list("", { limit: 1 })).items.length, 1);
    for (const limit of [0, -1, 1001, 1.5, Number.NaN]) {
      const res = await s.list("", { limit });
      assert.equal(res.ok, false, `limit ${limit}`);
      if (!res.ok) assert.equal(res.error.kind, "validation");
    }
  }));

  test(`${name}: list rejects a bad cursor`, withStorage(make, async (s) => {
    unwrap(await s.put("a", bytes(1), { contentType: "t/t" }));
    for (const cursor of ["not base64url!", "a", Buffer.from("../x").toString("base64url"), "/"]) {
      const res = await s.list("", { cursor });
      assert.equal(res.ok, false, cursor);
      if (!res.ok) assert.equal(res.error.kind, "validation");
    }
  }));

  test(`${name}: list prefixes follow the key rules but may be empty or end with a slash`, withStorage(make, async (s) => {
    unwrap(await s.put("a/b", bytes(1), { contentType: "t/t" }));
    unwrap(await s.list(""));
    unwrap(await s.list("a/"));
    for (const prefix of ["/", "/a", "a\\", "a\0", "a//", "../", "a/../", ".meta/", "meta__", "x".repeat(1025)]) {
      const res = await s.list(prefix);
      assert.equal(res.ok, false, prefix);
      if (!res.ok) assert.equal(res.error.kind, "validation");
    }
  }));
}
