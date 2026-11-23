import type { IdGenerator } from "../../../ports/ids.ts";

/** Predictable IDs for tests: "id-1", "id-2", and so on. */
export function createSequenceIds(prefix = "id"): IdGenerator {
  let n = 0;
  return { next: () => `${prefix}-${++n}` };
}
