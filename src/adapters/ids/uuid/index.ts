import { randomUUID } from "node:crypto";
import type { IdGenerator } from "../../../ports/ids.ts";

export function createUuidIds(): IdGenerator {
  return { next: () => randomUUID() };
}
