// RateLimiter port. Counts requests per key in fixed windows and says whether the caller may go on.
//
// Semantics (every adapter behaves the same, and the contract suite checks each line):
// - Fixed windows aligned to the epoch: windowStart = floor(nowMs / windowMs) * windowMs. Each `check` counts one
//   request in the current window for `key`. Time comes from the injected Clock.
// - allowed = count <= limit. remaining = max(0, limit - count). resetAt = ISO string of windowStart + windowMs.
//   retryAfterSeconds = 0 when allowed, else max(1, ceil((resetAt - now) / 1000)). `limit` echoes the rule.
// - Going over the limit is a normal value (allowed: false), not an error. The stored count never grows past limit + 1.
// - `validation` error: limit not an integer >= 1, windowMs not an integer >= 1000, key empty or longer than 200 characters.
// - Different keys are counted separately. The same key with a different windowMs is counted separately too.
// - When the clock moves into the next window, the count starts again.
// - Concurrency: 50 `check` calls for one key at once with limit 10 give exactly 10 with allowed: true.
// - Nothing throws out of `check`. A failure of the underlying store comes back as an error Result.
//
// Adapters: memory, database.
// Planned adapters (not built): Durable Objects (strong consistency across server instances).
// The database adapter is correct inside one process only.

import type { Result } from "../lib/result.ts";

export type Rule = { limit: number; windowMs: number };

export type Allowance = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** ISO 8601 UTC end of the current window. */
  resetAt: string;
  retryAfterSeconds: number;
};

export interface RateLimiter {
  /** Adapter name: "memory" | "database". */
  readonly name: string;
  check(key: string, rule: Rule): Promise<Result<Allowance>>;
}
