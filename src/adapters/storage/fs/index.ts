// Object storage on the local file system. The only storage code that may import `node:fs`.
// Layout: <root>/objects/<key> holds the bytes, <root>/meta/<key>.json holds {"contentType": ...},
// <root>/tmp holds files being written. A write goes to tmp first and is then renamed into place.
// Nothing outside <root> is ever touched: keys are validated, and every resolved path is checked to stay inside.
// Known limit: keys "a" and "a/b" cannot both exist (a file cannot also be a directory). The second put
// returns a "conflict" error. The memory adapter accepts both.

import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { portError } from "../../../lib/port-error.ts";
import { err, ok } from "../../../lib/result.ts";
import type { Result } from "../../../lib/result.ts";
import type { ListPage, ObjectMeta, ObjectStorage, StoredObject } from "../../../ports/storage.ts";
import { errorMap } from "./errors.ts";

const ADAPTER = "storage/fs";
const MAX_KEY = 1024;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;
const RESERVED_FIRST = new Set([".meta", "meta__"]);
const DEFAULT_TYPE = "application/octet-stream";
/** Codes meaning "there is no object at this key". */
const ABSENT = new Set(["ENOENT", "ENOTDIR", "EISDIR"]);

export type FsStorageOptions = { root: string };

function keyProblem(value: string, kind: "key" | "prefix"): string | null {
  if (kind === "key" && value === "") return "key must not be empty";
  if (value.length > MAX_KEY) return `${kind} is longer than ${MAX_KEY} characters`;
  if (value.startsWith("/")) return `${kind} must not start with "/"`;
  if (value.includes("\\")) return `${kind} must not contain a backslash`;
  if (value.includes("\0")) return `${kind} must not contain a NUL character`;
  if (value === "") return null;
  const segments = value.split("/");
  for (const [i, segment] of segments.entries()) {
    const last = i === segments.length - 1;
    if (segment === "" && !(kind === "prefix" && last)) return `${kind} must not have an empty path segment`;
    if (segment === "." || segment === "..") return `${kind} must not have a "." or ".." path segment`;
    if (i === 0 && RESERVED_FIRST.has(segment)) return `${kind} must not start with ".meta" or "meta__"`;
  }
  return null;
}

function encodeCursor(key: string): string {
  return Buffer.from(key, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): string | null {
  const key = Buffer.from(cursor, "base64url").toString("utf8");
  return encodeCursor(key) === cursor && keyProblem(key, "key") === null ? key : null;
}

function codeOf(thrown: unknown): string | undefined {
  const code = (thrown as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

export function createFsStorage(options: FsStorageOptions): ObjectStorage {
  const root = resolve(options.root);
  const objectsDir = join(root, "objects");
  const metaDir = join(root, "meta");
  const tmpDir = join(root, "tmp");

  const invalid = (message: string) => err(portError("validation", ADAPTER, message));
  const failed = (op: string, cause: unknown) =>
    err(portError(errorMap.map(cause), ADAPTER, `fs ${op} failed${codeOf(cause) ? `: ${codeOf(cause)}` : ""}`, { cause }));

  /** Resolves `<base>/<rel>` and returns null when the result is not inside `base`. */
  const inside = (base: string, rel: string): string | null => {
    const full = resolve(base, rel);
    return full.startsWith(base + sep) ? full : null;
  };

  async function readMeta(key: string): Promise<string> {
    const path = inside(metaDir, `${key}.json`);
    if (path === null) return DEFAULT_TYPE;
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(path, "utf8"));
      const type = (parsed as { contentType?: unknown } | null)?.contentType;
      return typeof type === "string" && type !== "" ? type : DEFAULT_TYPE;
    } catch {
      return DEFAULT_TYPE;
    }
  }

  async function writeAtomic(target: string, data: Uint8Array | string): Promise<string> {
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.mkdir(dirname(target), { recursive: true });
    const tmp = join(tmpDir, randomUUID());
    try {
      await fs.writeFile(tmp, data);
      return tmp;
    } catch (e) {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
      throw e;
    }
  }

  async function walk(dir: string, rel: string, out: string[]): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (e) {
      if (ABSENT.has(codeOf(e) ?? "")) return;
      throw e;
    }
    for (const entry of entries) {
      const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) await walk(join(dir, entry.name), childRel, out);
      else if (entry.isFile()) out.push(childRel);
    }
  }

  return {
    name: "fs",
    async get(key: string): Promise<Result<StoredObject | null>> {
      const problem = keyProblem(key, "key");
      if (problem) return invalid(problem);
      const path = inside(objectsDir, key);
      if (path === null) return invalid("key escapes the storage root");
      try {
        const buf = await fs.readFile(path);
        const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength).slice();
        return ok({ key, contentType: await readMeta(key), size: bytes.length, bytes });
      } catch (e) {
        if (ABSENT.has(codeOf(e) ?? "")) return ok(null);
        return failed("read", e);
      }
    },
    async put(key: string, bytes: Uint8Array, putOptions: { contentType: string }): Promise<Result<ObjectMeta>> {
      const problem = keyProblem(key, "key");
      if (problem) return invalid(problem);
      if (!(bytes instanceof Uint8Array)) return invalid("bytes must be a Uint8Array");
      if (typeof putOptions?.contentType !== "string" || putOptions.contentType === "") {
        return invalid("contentType must be a non-empty string");
      }
      const objectPath = inside(objectsDir, key);
      const metaPath = inside(metaDir, `${key}.json`);
      if (objectPath === null || metaPath === null) return invalid("key escapes the storage root");
      const temps: string[] = [];
      try {
        const metaTmp = await writeAtomic(metaPath, JSON.stringify({ contentType: putOptions.contentType }));
        temps.push(metaTmp);
        const objectTmp = await writeAtomic(objectPath, bytes);
        temps.push(objectTmp);
        await fs.rename(metaTmp, metaPath);
        await fs.rename(objectTmp, objectPath);
        return ok({ key, contentType: putOptions.contentType, size: bytes.length });
      } catch (e) {
        await Promise.all(temps.map((t) => fs.rm(t, { force: true }).catch(() => undefined)));
        return failed("write", e);
      }
    },
    async delete(key: string): Promise<Result<void>> {
      const problem = keyProblem(key, "key");
      if (problem) return invalid(problem);
      const objectPath = inside(objectsDir, key);
      const metaPath = inside(metaDir, `${key}.json`);
      if (objectPath === null || metaPath === null) return invalid("key escapes the storage root");
      try {
        // Object first: a crash in between leaves a stray meta file, never an object with the wrong type.
        for (const path of [objectPath, metaPath]) {
          try {
            await fs.unlink(path);
          } catch (e) {
            if (!ABSENT.has(codeOf(e) ?? "")) throw e;
          }
        }
        return ok(undefined);
      } catch (e) {
        return failed("delete", e);
      }
    },
    async list(prefix: string, listOptions: { cursor?: string; limit?: number } = {}): Promise<Result<ListPage>> {
      const problem = keyProblem(prefix, "prefix");
      if (problem) return invalid(problem);
      const limit = listOptions.limit ?? DEFAULT_LIMIT;
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        return invalid(`limit must be an integer from 1 to ${MAX_LIMIT}`);
      }
      let after: string | null = null;
      if (listOptions.cursor !== undefined) {
        after = decodeCursor(listOptions.cursor);
        if (after === null) return invalid("cursor is not valid");
      }
      try {
        const all: string[] = [];
        await walk(objectsDir, "", all);
        const keys = all
          .filter((k) => k.startsWith(prefix) && (after === null || k > after))
          .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        const page = keys.slice(0, limit);
        const items: ObjectMeta[] = [];
        for (const key of page) {
          const path = inside(objectsDir, key);
          if (path === null) continue;
          const stat = await fs.stat(path);
          items.push({ key, contentType: await readMeta(key), size: stat.size });
        }
        const lastKey = page[page.length - 1];
        return ok({ items, nextCursor: keys.length > limit && lastKey !== undefined ? encodeCursor(lastKey) : null });
      } catch (e) {
        return failed("list", e);
      }
    },
  };
}
