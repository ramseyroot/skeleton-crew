import type { ZodType } from "zod";
import { miss } from "../../../lib/cache-envelope.ts";
import type { CacheRead } from "../../../lib/cache-envelope.ts";
import { portError } from "../../../lib/port-error.ts";
import { err, ok } from "../../../lib/result.ts";
import type { Result } from "../../../lib/result.ts";
import type { Cache } from "../../../ports/cache.ts";
import type { Clock } from "../../../ports/clock.ts";
import type { Logger } from "../../../ports/logger.ts";

export type NullCacheOptions = {
  app: string;
  env: string;
  schemaVersion: number;
  clock: Clock;
  logger: Logger;
};

/**
 * Always misses and discards writes. prefixDelete is true because it stores nothing,
 * so "delete everything under this prefix" is trivially correct.
 */
export function createNullCache(_options: NullCacheOptions): Cache {
  return {
    name: "null",
    capabilities: { prefixDelete: true },
    async get<T>(_key: string, _schema: ZodType<T>): Promise<Result<CacheRead<T>>> {
      return ok(miss("absent"));
    },
    async set<T>(_key: string, _value: T, setOptions: { ttlMs: number }): Promise<Result<void>> {
      if (!Number.isInteger(setOptions.ttlMs) || setOptions.ttlMs <= 0) {
        return err(portError("validation", "cache/null", "ttlMs must be a positive integer"));
      }
      return ok(undefined);
    },
    async delete(_key: string): Promise<Result<void>> {
      return ok(undefined);
    },
    async deleteByPrefix(_prefix: string): Promise<Result<{ deleted: number }>> {
      return ok({ deleted: 0 });
    },
  };
}
