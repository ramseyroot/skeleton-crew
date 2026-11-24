import { portError } from "../../../lib/port-error.ts";
import { err, ok } from "../../../lib/result.ts";
import type { Result } from "../../../lib/result.ts";
import type { Clock } from "../../../ports/clock.ts";
import type { Database } from "../../../ports/database.ts";
import type { Allowance, RateLimiter, Rule } from "../../../ports/limiter.ts";
import { errorMap } from "./errors.ts";

const NAME = "database";
const ADAPTER = `limiter/${NAME}`;
const COLLECTION = "rate_windows";

/** Correct inside one process only: the per-key mutex lives in this process's memory. */
export function createDatabaseLimiter(deps: { database: Database; clock: Clock }): RateLimiter {
  const { database, clock } = deps;
  const tails = new Map<string, Promise<unknown>>();
  let migrated = false;

  /** Runs fn after every earlier call with the same key has finished. */
  function serialize<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const tail = tails.get(key) ?? Promise.resolve();
    const run = tail.then(fn);
    const settled = run.then(
      () => undefined,
      () => undefined,
    );
    tails.set(key, settled);
    void settled.then(() => {
      if (tails.get(key) === settled) tails.delete(key);
    });
    return run;
  }

  async function count(key: string, rule: Rule): Promise<Result<Allowance>> {
    if (!migrated) {
      const m = await database.migrate([
        { name: COLLECTION, fields: { count: { type: "number" }, windowStart: { type: "number" } } },
      ]);
      if (!m.ok) return m;
      migrated = true;
    }
    const nowMs = Date.parse(clock.now());
    const windowStart = Math.floor(nowMs / rule.windowMs) * rule.windowMs;
    const id = `${key}:${rule.windowMs}:${windowStart}`;
    const reader = database.read(COLLECTION);
    const writer = database.write(COLLECTION);

    const found = await reader.get(id);
    if (!found.ok) return found;
    let total: number;
    if (found.value === null) {
      const created = await writer.create({ id, count: 1, windowStart });
      if (!created.ok) return created;
      total = 1;
      // Best effort: drop the previous window's record. Its failure does not matter.
      const previous = `${key}:${rule.windowMs}:${windowStart - rule.windowMs}`;
      try {
        await writer.delete(previous);
      } catch {
        // ignored
      }
    } else {
      const stored = found.value["count"];
      total = Math.min((typeof stored === "number" ? stored : 0) + 1, rule.limit + 1);
      const updated = await writer.update(id, { count: total });
      if (!updated.ok) return updated;
    }
    const resetMs = windowStart + rule.windowMs;
    const allowed = total <= rule.limit;
    return ok({
      allowed,
      limit: rule.limit,
      remaining: Math.max(0, rule.limit - total),
      resetAt: new Date(resetMs).toISOString(),
      retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((resetMs - nowMs) / 1000)),
    });
  }

  return {
    name: NAME,
    async check(key: string, rule: Rule): Promise<Result<Allowance>> {
      if (typeof key !== "string" || key.length < 1 || key.length > 200) {
        return err(portError("validation", ADAPTER, "key must be 1 to 200 characters"));
      }
      if (!Number.isInteger(rule?.limit) || rule.limit < 1) {
        return err(portError("validation", ADAPTER, "limit must be an integer >= 1"));
      }
      if (!Number.isInteger(rule.windowMs) || rule.windowMs < 1000) {
        return err(portError("validation", ADAPTER, "windowMs must be an integer >= 1000"));
      }
      try {
        return await serialize(key, () => count(key, rule));
      } catch (cause) {
        return err(portError(errorMap.map(cause), ADAPTER, "limiter failed", { cause }));
      }
    },
  };
}
