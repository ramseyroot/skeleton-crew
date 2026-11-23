import type { ZodType } from "zod";
import { cacheKey, miss, unwrapJson, wrap } from "../../../lib/cache-envelope.ts";
import type { CacheRead } from "../../../lib/cache-envelope.ts";
import { portError } from "../../../lib/port-error.ts";
import { err, ok } from "../../../lib/result.ts";
import type { Result } from "../../../lib/result.ts";
import type { Cache } from "../../../ports/cache.ts";
import type { Clock } from "../../../ports/clock.ts";
import type { Logger } from "../../../ports/logger.ts";

const NAME = "memory";
const STEP = `adapter:cache/${NAME}`;
const ADAPTER = `cache/${NAME}`;

export type MemoryCacheOptions = {
  app: string;
  env: string;
  schemaVersion: number;
  clock: Clock;
  logger: Logger;
  /** Backing store, shared between caches to test namespacing. Values are envelope JSON strings. */
  store?: Map<string, string>;
};

export type MemoryCache = Cache & {
  /** Test only: stores raw text under the namespaced form of a logical key. */
  plantRaw(key: string, raw: string): void;
  /** Test only: logical keys held in this cache's namespace. */
  rawKeys(): string[];
};

export function createMemoryCache(options: MemoryCacheOptions): MemoryCache {
  const store = options.store ?? new Map<string, string>();
  const full = (key: string): string =>
    cacheKey({ app: options.app, env: options.env, adapter: NAME, schemaVersion: options.schemaVersion, key });
  const nsPrefix = full("");

  const debug = (what: string, key: string): void => {
    options.logger.log({
      stripId: "",
      step: STEP,
      class: "cache",
      phase: "debug",
      source: "cache",
      message: `cache entry ${what}, deleted: ${key}`,
    });
  };

  return {
    name: NAME,
    capabilities: { prefixDelete: true },
    plantRaw(key, raw) {
      store.set(full(key), raw);
    },
    rawKeys() {
      return [...store.keys()].filter((k) => k.startsWith(nsPrefix)).map((k) => k.slice(nsPrefix.length));
    },
    async get<T>(key: string, schema: ZodType<T>): Promise<Result<CacheRead<T>>> {
      const k = full(key);
      const read = unwrapJson(store.get(k), schema, {
        schemaVersion: options.schemaVersion,
        now: options.clock.now(),
      });
      if (read.hit) return ok(read);
      if (read.reason !== "absent") {
        store.delete(k);
        debug(read.reason, key);
      }
      return ok(miss(read.reason));
    },
    async set<T>(key: string, value: T, setOptions: { ttlMs: number }): Promise<Result<void>> {
      if (!Number.isInteger(setOptions.ttlMs) || setOptions.ttlMs <= 0) {
        return err(portError("validation", ADAPTER, "ttlMs must be a positive integer"));
      }
      if (value === undefined) {
        return err(portError("validation", ADAPTER, "value is not JSON-serializable"));
      }
      let text: string | undefined;
      try {
        text = JSON.stringify(
          wrap(value, { schemaVersion: options.schemaVersion, ttlMs: setOptions.ttlMs, now: options.clock.now() }),
        );
      } catch (cause) {
        return err(portError("validation", ADAPTER, "value is not JSON-serializable", { cause }));
      }
      store.set(full(key), text);
      return ok(undefined);
    },
    async delete(key: string): Promise<Result<void>> {
      store.delete(full(key));
      return ok(undefined);
    },
    async deleteByPrefix(prefix: string): Promise<Result<{ deleted: number }>> {
      const start = full(prefix);
      let deleted = 0;
      for (const k of [...store.keys()]) {
        if (k.startsWith(start)) {
          store.delete(k);
          deleted += 1;
        }
      }
      return ok({ deleted });
    },
  };
}
