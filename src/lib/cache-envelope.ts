// The shape every cache adapter stores (plan section 12).
// A cache is never the source of truth: a corrupt, outdated or expired entry is a miss, not an error.

import { z } from "zod";
import type { ZodType } from "zod";

export type Envelope<T> = {
  schemaVersion: number;
  /** ISO 8601 UTC. */
  storedAt: string;
  ttlMs: number;
  value: T;
};

const envelopeShape = z.object({
  schemaVersion: z.number().int(),
  storedAt: z.iso.datetime(),
  ttlMs: z.number().int().positive(),
  value: z.unknown(),
});

export type MissReason = "absent" | "corrupt" | "outdated" | "expired";

export type CacheRead<T> = { hit: true; value: T } | { hit: false; reason: MissReason };

/** A miss is a normal value, never an error. */
export const miss = (reason: MissReason): CacheRead<never> => ({ hit: false, reason });

/**
 * Wraps a value for storage. `ttlMs` must be a positive integer and `now` an ISO 8601 UTC string.
 * A bad ttl is a programming error: it throws, and the step wrapper reports it as `unexpected`.
 */
export function wrap<T>(value: T, options: { schemaVersion: number; ttlMs: number; now: string }): Envelope<T> {
  if (!Number.isInteger(options.ttlMs) || options.ttlMs <= 0) {
    throw new RangeError(`cache ttlMs must be a positive integer, got ${String(options.ttlMs)}`);
  }
  return { schemaVersion: options.schemaVersion, storedAt: options.now, ttlMs: options.ttlMs, value };
}

/**
 * Reads a stored entry. Returns a hit only when the shape is valid, the version matches,
 * the entry has not expired, and the value passes its schema. Anything else is a miss.
 * Adapters delete the entry on `corrupt`, `outdated` and `expired`, and log at debug level.
 */
export function unwrap<T>(
  raw: unknown,
  schema: ZodType<T>,
  options: { schemaVersion: number; now: string },
): CacheRead<T> {
  if (raw === undefined || raw === null) return miss("absent");
  const shape = envelopeShape.safeParse(raw);
  if (!shape.success) return miss("corrupt");
  const entry = shape.data;
  if (entry.schemaVersion !== options.schemaVersion) return miss("outdated");
  const expiresAt = Date.parse(entry.storedAt) + entry.ttlMs;
  if (Date.parse(options.now) >= expiresAt) return miss("expired");
  const value = schema.safeParse(entry.value);
  if (!value.success) return miss("corrupt");
  return { hit: true, value: value.data };
}

/** For adapters that store text (files, SQLite). Text that is not JSON is `corrupt`. */
export function unwrapJson<T>(
  text: string | undefined | null,
  schema: ZodType<T>,
  options: { schemaVersion: number; now: string },
): CacheRead<T> {
  if (text === undefined || text === null) return miss("absent");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return miss("corrupt");
  }
  return unwrap(raw, schema, options);
}

/**
 * Builds a namespaced key: app, environment, adapter and schema version come first, so switching
 * provider, profile or version cannot read old entries. The namespace parts are URL-encoded so a
 * ":" inside one cannot shift the others. `key` is kept as given, so prefixes such as "profile:" work.
 */
export function cacheKey(parts: {
  app: string;
  env: string;
  adapter: string;
  schemaVersion: number;
  key: string;
}): string {
  const enc = encodeURIComponent;
  return `${enc(parts.app)}:${enc(parts.env)}:${enc(parts.adapter)}:v${parts.schemaVersion}:${parts.key}`;
}
