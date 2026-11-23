import type { Clock } from "../../../ports/clock.ts";

export type FixedClock = Clock & {
  set(iso: string): void;
  advance(ms: number): void;
};

/** A clock that only moves when told to. Starts at `start` (ISO 8601 UTC). */
export function createFixedClock(start = "2026-01-01T00:00:00.000Z"): FixedClock {
  let ms = Date.parse(start);
  if (Number.isNaN(ms)) throw new RangeError(`fixed clock needs an ISO date, got ${start}`);
  return {
    now: () => new Date(ms).toISOString(),
    set(iso) {
      const parsed = Date.parse(iso);
      if (Number.isNaN(parsed)) throw new RangeError(`fixed clock needs an ISO date, got ${iso}`);
      ms = parsed;
    },
    advance(delta) {
      ms += delta;
    },
  };
}
