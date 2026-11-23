import { create } from "../adapters/cache/memory/index.ts";
import { create as gone } from "../adapters/cache/redis/index.ts";
export const registry = { create, gone };
