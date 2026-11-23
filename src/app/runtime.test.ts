import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { createRuntime } from "./runtime.ts";

const tmp = mkdtempSync(join(tmpdir(), "skel-runtime-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

const devEnv = (name: string, extra: Record<string, string> = {}) => ({
  APP_ENV: "dev",
  DATABASE_PATH: join(tmp, `${name}.db`),
  STORAGE_PATH: join(tmp, `${name}-files`),
  ...extra,
});

test("a dev runtime is empty unless APP_SEED=1", async () => {
  const rt = await createRuntime(devEnv("plain"));
  const list = await rt.ports.database.read("users").list();
  assert.equal(list.ok && list.value.items.length, 0);
});

test("APP_SEED=1 adds the demo users once, however often the runtime starts", async () => {
  const env = devEnv("seeded", { APP_SEED: "1" });
  await createRuntime(env);
  const rt = await createRuntime(env);
  const list = await rt.ports.database.read("users").list();
  assert.equal(list.ok && list.value.items.length, 2);
  const ada = await rt.ports.database.read("users").get("u1");
  assert.equal(ada.ok && ada.value?.displayName, "Ada");
});

test("prod never seeds, even when asked", async () => {
  const rt = await createRuntime({ APP_ENV: "prod", APP_SEED: "1", DATABASE_PATH: join(tmp, "prod.db"), STORAGE_PATH: join(tmp, "prod-files") });
  const list = await rt.ports.database.read("users").list();
  assert.equal(list.ok && list.value.items.length, 0);
});

test("a bad profile stops the runtime with every problem listed", async () => {
  await assert.rejects(createRuntime({ APP_ENV: "dev" }), /Startup stopped\. 2 problem\(s\)/);
  await assert.rejects(createRuntime({}), /APP_ENV is not set/);
});
