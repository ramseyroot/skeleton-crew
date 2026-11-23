import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { defineFeature } from "../lib/feature.ts";
import { err, makeError, ok } from "../lib/result.ts";
import { createRuntime } from "./runtime.ts";

const tmp = mkdtempSync(join(tmpdir(), "skel-runtime-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

const devEnv = (name: string, extra: Record<string, string> = {}) => ({
  APP_ENV: "dev",
  DATABASE_PATH: join(tmp, `${name}.db`),
  STORAGE_PATH: join(tmp, `${name}-files`),
  ...extra,
});

// A feature made for this test, so the runtime is tested without any real feature.
const notes = defineFeature({
  name: "notes",
  collections: [{ name: "notes", fields: { title: { type: "string" } } }],
  seed: async (ports) => {
    const existing = await ports.database.read("notes").get("n1");
    if (!existing.ok) return err(existing.error);
    if (existing.value === null) {
      const created = await ports.database.write("notes").create({ id: "n1", title: "First" });
      if (!created.ok) return err(created.error);
    }
    return ok(undefined);
  },
});

const count = async (rt: Awaited<ReturnType<typeof createRuntime>>): Promise<number | null> => {
  const list = await rt.ports.database.read("notes").list();
  return list.ok ? list.value.items.length : null;
};

test("the runtime migrates every listed feature's collections, and a dev runtime is empty unless APP_SEED=1", async () => {
  const rt = await createRuntime(devEnv("plain"), [notes]);
  assert.equal(await count(rt), 0);
});

test("APP_SEED=1 runs each feature's seed once, however often the runtime starts", async () => {
  const env = devEnv("seeded", { APP_SEED: "1" });
  await createRuntime(env, [notes]);
  const rt = await createRuntime(env, [notes]);
  assert.equal(await count(rt), 1);
});

test("prod never seeds, even when asked", async () => {
  const rt = await createRuntime({ APP_ENV: "prod", APP_SEED: "1", DATABASE_PATH: join(tmp, "prod.db"), STORAGE_PATH: join(tmp, "prod-files") }, [notes]);
  assert.equal(await count(rt), 0);
});

test("a feature whose seed fails stops the runtime and names the feature", async () => {
  const broken = defineFeature({
    name: "broken",
    collections: [],
    seed: async () => err(makeError("unexpected", "seed", "", "disk on fire")),
  });
  await assert.rejects(createRuntime(devEnv("broken", { APP_SEED: "1" }), [broken]), /seeding "broken" failed: disk on fire/);
});

test("with no features at all, the runtime still starts", async () => {
  const rt = await createRuntime(devEnv("none", { APP_SEED: "1" }), []);
  assert.equal(rt.profile.env, "dev");
});

test("a bad profile stops the runtime with every problem listed", async () => {
  await assert.rejects(createRuntime({ APP_ENV: "dev" }, []), /Startup stopped\. 2 problem\(s\)/);
  await assert.rejects(createRuntime({}, []), /APP_ENV is not set/);
});
