import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runStorageContract } from "../contract.test.ts";
import { errorMap } from "./errors.ts";
import { createFsStorage } from "./index.ts";

function tempDir(): string {
  return fs.mkdtempSync(join(os.tmpdir(), "skel-storage-"));
}

runStorageContract("storage/fs", () => {
  const dir = tempDir();
  return {
    storage: createFsStorage({ root: join(dir, "root") }),
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
});

/** Every file under `dir`, relative, sorted. */
function tree(dir: string): string[] {
  return fs.readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name).slice(dir.length + 1))
    .sort();
}

test("storage/fs: objects and content types are stored under objects/ and meta/", async () => {
  const dir = tempDir();
  try {
    const root = join(dir, "root");
    const storage = createFsStorage({ root });
    await storage.put("a/b.txt", new Uint8Array([104, 105]), { contentType: "text/plain" });
    assert.equal(fs.readFileSync(join(root, "objects", "a", "b.txt"), "utf8"), "hi");
    assert.deepEqual(JSON.parse(fs.readFileSync(join(root, "meta", "a", "b.txt.json"), "utf8")), {
      contentType: "text/plain",
    });
    assert.deepEqual(tree(root), ["meta/a/b.txt.json", "objects/a/b.txt"]);
    assert.equal(storage.name, "fs");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("storage/fs: a second instance on the same root sees the objects", async () => {
  const dir = tempDir();
  try {
    const root = join(dir, "root");
    await createFsStorage({ root }).put("k", new Uint8Array([5]), { contentType: "t/t" });
    const got = await createFsStorage({ root }).get("k");
    assert.deepEqual(got.ok && got.value?.bytes, new Uint8Array([5]));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("storage/fs: no temp files are left after writes, overwrites and deletes", async () => {
  const dir = tempDir();
  try {
    const root = join(dir, "root");
    const storage = createFsStorage({ root });
    await storage.put("k", new Uint8Array([1]), { contentType: "t/t" });
    await storage.put("k", new Uint8Array([2]), { contentType: "t/t" });
    await storage.put("j", new Uint8Array([3]), { contentType: "t/t" });
    await storage.delete("j");
    assert.deepEqual(tree(root), ["meta/k.json", "objects/k"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("storage/fs: a stray file in tmp/ is not listed", async () => {
  const dir = tempDir();
  try {
    const root = join(dir, "root");
    const storage = createFsStorage({ root });
    await storage.put("k", new Uint8Array([1]), { contentType: "t/t" });
    fs.writeFileSync(join(root, "tmp", "half-written"), "x");
    const page = await storage.list("");
    assert.deepEqual(page.ok && page.value.items.map((i) => i.key), ["k"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("storage/fs: nothing outside root is touched, even for odd keys", async () => {
  const dir = tempDir();
  try {
    const root = join(dir, "root");
    fs.mkdirSync(join(dir, "sibling"));
    fs.writeFileSync(join(dir, "sibling", "secret"), "keep");
    fs.writeFileSync(join(dir, "outside.txt"), "keep");
    const before = tree(dir);
    const storage = createFsStorage({ root });
    const keys = ["../outside.txt", "../sibling/secret", "a/../../outside.txt", "/etc/passwd", "..", "a\\..\\..\\x", "..%2f"];
    for (const key of keys) {
      await storage.put(key, new Uint8Array([1]), { contentType: "t/t" });
      await storage.delete(key);
      await storage.get(key);
    }
    assert.deepEqual(tree(dir).filter((f) => !f.startsWith("root/")), before);
    assert.equal(fs.readFileSync(join(dir, "outside.txt"), "utf8"), "keep");
    assert.equal(fs.readFileSync(join(dir, "sibling", "secret"), "utf8"), "keep");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("storage/fs: a real failure (root's parent is a regular file) maps to conflict", async () => {
  const dir = tempDir();
  try {
    const blocker = join(dir, "blocker");
    fs.writeFileSync(blocker, "i am a file");
    const storage = createFsStorage({ root: join(blocker, "root") });
    const put = await storage.put("k", new Uint8Array([1]), { contentType: "t/t" });
    assert.equal(put.ok, false);
    if (!put.ok) {
      assert.equal(put.error.kind, "conflict");
      assert.equal(put.error.step, "adapter:storage/fs");
      assert.match(put.error.message, /ENOTDIR/);
      assert.equal((put.error.cause as { code?: string }).code, "ENOTDIR");
    }
    // Reading under such a root finds nothing rather than failing.
    assert.deepEqual(await storage.get("k"), { ok: true, value: null });
    assert.deepEqual(await storage.list(""), { ok: true, value: { items: [], nextCursor: null } });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("storage/fs: a path segment longer than the file system allows is a validation error", async () => {
  const dir = tempDir();
  try {
    const storage = createFsStorage({ root: join(dir, "root") });
    const res = await storage.put("k".repeat(300), new Uint8Array([1]), { contentType: "t/t" });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.error.kind, "validation");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("storage/fs: a key that is both an object and a folder is a conflict", async () => {
  const dir = tempDir();
  try {
    const storage = createFsStorage({ root: join(dir, "root") });
    assert.equal((await storage.put("a", new Uint8Array([1]), { contentType: "t/t" })).ok, true);
    const res = await storage.put("a/b", new Uint8Array([1]), { contentType: "t/t" });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.error.kind, "conflict");
    assert.deepEqual(await storage.get("a/b"), { ok: true, value: null });
    assert.deepEqual(tree(join(dir, "root")), ["meta/a.json", "objects/a"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("storage/fs: a read-only directory maps to forbidden", { skip: process.getuid?.() === 0 }, async () => {
  const dir = tempDir();
  try {
    const root = join(dir, "root");
    fs.mkdirSync(root);
    fs.chmodSync(root, 0o500);
    const res = await createFsStorage({ root }).put("k", new Uint8Array([1]), { contentType: "t/t" });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.error.kind, "forbidden");
    fs.chmodSync(root, 0o700);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("storage/fs: error map covers each provider code", () => {
  const code = (c: string) => Object.assign(new Error(c), { code: c });
  const expected: Record<string, string> = {
    EACCES: "forbidden",
    EPERM: "forbidden",
    EROFS: "forbidden",
    ENOENT: "not_found",
    ENOTDIR: "conflict",
    EISDIR: "conflict",
    EEXIST: "conflict",
    ENOTEMPTY: "conflict",
    ENAMETOOLONG: "validation",
    ENOSPC: "unexpected",
    EIO: "unexpected",
    EMFILE: "unexpected",
    EWHATEVER: "unexpected",
  };
  for (const [c, kind] of Object.entries(expected)) assert.equal(errorMap.map(code(c)), kind, c);
  assert.equal(errorMap.map(new Error("no code")), "unexpected");
  assert.equal(errorMap.map("a string"), "unexpected");
});
