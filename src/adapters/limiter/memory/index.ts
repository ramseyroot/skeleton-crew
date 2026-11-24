import { portError } from "../../../lib/port-error.ts";
import { err, ok } from "../../../lib/result.ts";
import type { Result } from "../../../lib/result.ts";
import type { Clock } from "../../../ports/clock.ts";
import type { Allowance, RateLimiter, Rule } from "../../../ports/limiter.ts";
import { errorMap } from "./errors.ts";

const NAME = "memory";
const ADAPTER = `limiter/${NAME}`;

export function createMemoryLimiter(deps: { clock: Clock }): RateLimiter {
  const counters = new Map<string, number>();
  /** Latest window seen per `${key}:${windowMs}`, used to prune older windows. */
  const latest = new Map<string, { windowStart: number; id: string }>();

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
        const nowMs = Date.parse(deps.clock.now());
        const windowStart = Math.floor(nowMs / rule.windowMs) * rule.windowMs;
        const scope = `${key}:${rule.windowMs}`;
        const id = `${scope}:${windowStart}`;
        const prev = latest.get(scope);
        if (prev === undefined || prev.windowStart < windowStart) {
          if (prev !== undefined) counters.delete(prev.id);
          latest.set(scope, { windowStart, id });
        }
        const count = Math.min((counters.get(id) ?? 0) + 1, rule.limit + 1);
        counters.set(id, count);
        const resetMs = windowStart + rule.windowMs;
        const allowed = count <= rule.limit;
        return ok({
          allowed,
          limit: rule.limit,
          remaining: Math.max(0, rule.limit - count),
          resetAt: new Date(resetMs).toISOString(),
          retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((resetMs - nowMs) / 1000)),
        });
      } catch (cause) {
        return err(portError(errorMap.map(cause), ADAPTER, "limiter failed", { cause }));
      }
    },
  };
}
