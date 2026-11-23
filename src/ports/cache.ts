// Cache port. A cache is never the source of truth: it can lose or ignore any entry at any time.
//
// Semantics:
// - Callers pass logical keys such as "profile:u1". The adapter namespaces them with
//   `cacheKey({ app, env, adapter, schemaVersion, key })` and stores a versioned envelope (lib/cache-envelope.ts).
// - `get` returns ok({ hit: false, reason }) for absent, corrupt, outdated and expired entries. Never an error
//   for those. On corrupt, outdated and expired the adapter deletes the entry and writes one debug log entry
//   (step "adapter:cache/<name>", class "cache") that names the key and never the value.
// - `set` needs a positive integer `ttlMs` and a JSON-serializable value, otherwise it returns a validation error.
// - `deleteByPrefix` works only when `capabilities.prefixDelete` is true. Otherwise it returns the validation
//   error "prefix delete not supported". Callers and contract tests check the capability first.
// - Timestamps come from the injected Clock, as ISO 8601 UTC.
//
// Adapters: memory, null (always misses; stores nothing).
// Planned adapters (not built): Workers KV, Workers Cache API.

import type { ZodType } from "zod";
import type { CacheRead } from "../lib/cache-envelope.ts";
import type { Result } from "../lib/result.ts";

export type CacheCapabilities = { prefixDelete: boolean };

export interface Cache {
  /** Adapter name. It goes into keys: "memory" | "null". */
  readonly name: string;
  readonly capabilities: CacheCapabilities;
  get<T>(key: string, schema: ZodType<T>): Promise<Result<CacheRead<T>>>;
  set<T>(key: string, value: T, options: { ttlMs: number }): Promise<Result<void>>;
  delete(key: string): Promise<Result<void>>;
  /** Only when capabilities.prefixDelete is true; otherwise returns validation error "prefix delete not supported". */
  deleteByPrefix(prefix: string): Promise<Result<{ deleted: number }>>;
}
