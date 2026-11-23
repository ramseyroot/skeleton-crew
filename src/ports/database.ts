// Database port. A small record store: collections of flat records, read and write handles per collection,
// an atomic batch, a health check and an idempotent migrate. The app builds its repositories on top of it.
//
// Semantics (every adapter behaves the same, and the contract suite checks each line):
// - Collections are declared by the app with `migrate(defs)`. Using a collection that was not migrated, or an
//   unknown collection, is a `validation` error ("collection not migrated").
// - IDs are text supplied by the caller. The database never generates them.
// - Timestamps are ISO 8601 UTC strings taken from the injected Clock. `createdAt` and `id` never change;
//   `update` changes only `updatedAt` and the fields in the patch.
// - Reads: `get` of a missing id returns ok(null). `list` and `findBy` with no match return an empty result.
// - Writes: `update` or `delete` of a missing id is `not_found`. A duplicate id on create, or a violated
//   `unique` field on create or update, is `conflict`.
// - `validation`: unknown field, wrong value type, missing required field, reserved name (id, createdAt,
//   updatedAt) in a record or patch, `findBy` on a field that is neither `unique` nor `indexed`, a bad cursor,
//   and a `limit` below 1 or above 200 (default 50). The message names the problem.
// - Fields with `normalize: "lower"` are lowercased on write and on `findBy` lookup, so matching is case
//   insensitive. Unique checks use the normalized value. A null value never conflicts with another null.
// - `list` is ordered by id ascending (byte order of the UTF-8 text). The cursor is opaque (base64url of the last
//   returned id). `nextCursor` is null when no items remain. `findBy` is ordered by id.
// - `batch(ops)` is atomic. If any op fails, nothing is applied, and the error names the failing op, for example
//   `op 2 (update users u1): not_found`, with the same ErrorKind the single op would give. An op sees the
//   effects of earlier ops in the same batch. An empty batch succeeds. Interactive transactions are not exposed.
// - `health()` is ok({ healthy: true }) when the store is usable, otherwise a `network` or `unexpected` error.
// - Returned records are copies. Changing one never changes what is stored.
// - Nothing throws out of a port method. A failure inside the provider comes back as a Result error.
// - `migrate` is idempotent: it creates what is missing and calling it again with the same defs changes
//   nothing. A field of an existing collection cannot change its definition, and a field added later must be
//   optional. Names of collections and fields match /^[a-z][A-Za-z0-9_]*$/ and are unique ignoring case.
//
// Adapters: memory, sqlite.
// Planned adapters (not built): PocketBase, Supabase.

import type { Result } from "../lib/result.ts";

export type Scalar = string | number | boolean | null;

/** A stored record: id plus timestamps plus the collection's own fields. */
export type DbRecord = { id: string; createdAt: string; updatedAt: string } & { [field: string]: Scalar };

export type FieldType = "string" | "number" | "boolean";

export type FieldDef = {
  type: FieldType;
  optional?: boolean;
  unique?: boolean;
  indexed?: boolean;
  normalize?: "lower";
};

/** Declared by the app at migrate() time. `id`, `createdAt`, `updatedAt` are reserved names. */
export type CollectionDef = { name: string; fields: Record<string, FieldDef> };

export type Page = { items: DbRecord[]; nextCursor: string | null };

export type NewRecord = { id: string } & { [field: string]: Scalar };

export type BatchOp =
  | { op: "create"; collection: string; record: NewRecord }
  | { op: "update"; collection: string; id: string; patch: Record<string, Scalar> }
  | { op: "delete"; collection: string; id: string };

export interface DbReader {
  get(id: string): Promise<Result<DbRecord | null>>;
  /** Only for fields declared `unique` or `indexed`; otherwise validation error. Ordered by id. */
  findBy(field: string, value: Scalar): Promise<Result<DbRecord[]>>;
  list(options?: { cursor?: string; limit?: number }): Promise<Result<Page>>;
}

export interface DbWriter {
  create(record: NewRecord): Promise<Result<DbRecord>>;
  update(id: string, patch: Record<string, Scalar>): Promise<Result<DbRecord>>;
  delete(id: string): Promise<Result<void>>;
}

export interface Database {
  readonly name: string; // "memory" | "sqlite"
  read(collection: string): DbReader;
  write(collection: string): DbWriter;
  batch(ops: BatchOp[]): Promise<Result<void>>;
  health(): Promise<Result<{ healthy: true }>>;
  /** Idempotent. Creates what is missing. Calling it twice with the same defs changes nothing. */
  migrate(collections: CollectionDef[]): Promise<Result<void>>;
}
