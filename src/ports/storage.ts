// ObjectStorage port: named blobs with a content type.
//
// Semantics:
// - `get` of a missing key is ok(null). `delete` of a missing key succeeds. `put` overwrites.
// - Returned bytes are copies: changing them never changes what is stored.
// - `list(prefix)` returns objects whose key starts with prefix, ordered by key ascending. An empty prefix lists
//   everything. The cursor is opaque (base64url of the last key returned). `limit` defaults to 100 and must be 1..1000.
// - A valid key is non-empty, at most 1024 characters, has no leading "/", no backslash, no NUL, no empty, "." or ".."
//   path segment, and its first segment is not ".meta" or "meta__". Otherwise get, put and delete return a validation
//   error. A `list` prefix follows the same character rules but may be empty or end with "/".
//
// Adapters: memory, fs.
// Planned adapters (not built): R2.

import type { Result } from "../lib/result.ts";

export type ObjectMeta = { key: string; contentType: string; size: number };
export type StoredObject = ObjectMeta & { bytes: Uint8Array };
export type ListPage = { items: ObjectMeta[]; nextCursor: string | null };

export interface ObjectStorage {
  /** "memory" | "fs" */
  readonly name: string;
  get(key: string): Promise<Result<StoredObject | null>>;
  put(key: string, bytes: Uint8Array, options: { contentType: string }): Promise<Result<ObjectMeta>>;
  delete(key: string): Promise<Result<void>>;
  list(prefix: string, options?: { cursor?: string; limit?: number }): Promise<Result<ListPage>>;
}
