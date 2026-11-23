import { portError } from "../../../lib/port-error.ts";
import { err, ok } from "../../../lib/result.ts";
import type { Result } from "../../../lib/result.ts";
import type { ListPage, ObjectMeta, ObjectStorage, StoredObject } from "../../../ports/storage.ts";

const ADAPTER = "storage/memory";
const MAX_KEY = 1024;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;
const RESERVED_FIRST = new Set([".meta", "meta__"]);

/** Returns a problem text, or null when the key (or list prefix) is acceptable. */
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

export function createMemoryStorage(): ObjectStorage {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const invalid = (message: string) => err(portError("validation", ADAPTER, message));

  return {
    name: "memory",
    async get(key: string): Promise<Result<StoredObject | null>> {
      const problem = keyProblem(key, "key");
      if (problem) return invalid(problem);
      const found = objects.get(key);
      if (!found) return ok(null);
      return ok({ key, contentType: found.contentType, size: found.bytes.length, bytes: found.bytes.slice() });
    },
    async put(key: string, bytes: Uint8Array, options: { contentType: string }): Promise<Result<ObjectMeta>> {
      const problem = keyProblem(key, "key");
      if (problem) return invalid(problem);
      if (!(bytes instanceof Uint8Array)) return invalid("bytes must be a Uint8Array");
      if (typeof options?.contentType !== "string" || options.contentType === "") {
        return invalid("contentType must be a non-empty string");
      }
      objects.set(key, { bytes: bytes.slice(), contentType: options.contentType });
      return ok({ key, contentType: options.contentType, size: bytes.length });
    },
    async delete(key: string): Promise<Result<void>> {
      const problem = keyProblem(key, "key");
      if (problem) return invalid(problem);
      objects.delete(key);
      return ok(undefined);
    },
    async list(prefix: string, options: { cursor?: string; limit?: number } = {}): Promise<Result<ListPage>> {
      const problem = keyProblem(prefix, "prefix");
      if (problem) return invalid(problem);
      const limit = options.limit ?? DEFAULT_LIMIT;
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        return invalid(`limit must be an integer from 1 to ${MAX_LIMIT}`);
      }
      let after: string | null = null;
      if (options.cursor !== undefined) {
        after = decodeCursor(options.cursor);
        if (after === null) return invalid("cursor is not valid");
      }
      const keys = [...objects.keys()]
        .filter((k) => k.startsWith(prefix) && (after === null || k > after))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      const page = keys.slice(0, limit);
      const items: ObjectMeta[] = page.map((key) => {
        const o = objects.get(key);
        return { key, contentType: o?.contentType ?? "", size: o?.bytes.length ?? 0 };
      });
      const lastKey = page[page.length - 1];
      return ok({ items, nextCursor: keys.length > limit && lastKey !== undefined ? encodeCursor(lastKey) : null });
    },
  };
}
