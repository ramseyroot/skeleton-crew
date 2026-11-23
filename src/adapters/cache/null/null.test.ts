import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { createFixedClock } from "../../clock/fixed/index.ts";
import { createMemoryLogger } from "../../logger/memory/index.ts";
import { runCacheContract } from "../contract.test.ts";
import { errorMap } from "./errors.ts";
import { createNullCache } from "./index.ts";

function build() {
  const clock = createFixedClock();
  const logger = createMemoryLogger({ env: "local", clock });
  const cache = createNullCache({ app: "app", env: "local", schemaVersion: 1, clock, logger });
  return { cache, clock, logger };
}

runCacheContract("cache/null", () => build(), { stores: false });

test("cache/null: it always misses, even right after a set", async () => {
  const { cache, logger } = build();
  assert.equal((await cache.set("k", { n: 1 }, { ttlMs: 1000 })).ok, true);
  assert.deepEqual(await cache.get("k", z.object({ n: z.number() })), {
    ok: true,
    value: { hit: false, reason: "absent" },
  });
  assert.equal(logger.entries.length, 0);
});

test("cache/null: deleteByPrefix is supported and deletes nothing", async () => {
  const { cache } = build();
  assert.equal(cache.name, "null");
  assert.equal(cache.capabilities.prefixDelete, true);
  assert.deepEqual(await cache.deleteByPrefix("a:"), { ok: true, value: { deleted: 0 } });
});

test("cache/null: unmapped failures are unexpected", () => {
  assert.equal(errorMap.map(new Error("x")), "unexpected");
});
