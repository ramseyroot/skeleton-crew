import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { compose, composeOrThrow } from "./compose.ts";
import { profiles } from "./profiles.ts";
import { registry } from "./registry.ts";

const tmp = mkdtempSync(join(tmpdir(), "skel-compose-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

const testLocal = {
  ...profiles.local,
  adapters: { ...profiles.local.adapters, logger: "memory" },
  paths: { database: join(tmp, "local.db"), storage: join(tmp, "local-files") },
};
const set = { local: testLocal, dev: profiles.dev, prod: profiles.prod };

const problemsOf = (r: ReturnType<typeof compose>): string[] => (r.ok ? [] : r.problems);

test("a missing or unknown APP_ENV stops startup with a readable message", () => {
  assert.match(problemsOf(compose({ env: {}, profiles: set })).join(), /APP_ENV is not set/);
  assert.match(problemsOf(compose({ env: { APP_ENV: "" }, profiles: set })).join(), /APP_ENV is not set/);
  const unknown = problemsOf(compose({ env: { APP_ENV: "staging" }, profiles: set }));
  assert.match(unknown.join(), /"staging", which is not a profile.*local, dev, prod/);
  assert.match(problemsOf(compose({ env: { APP_ENV: "__proto__" }, profiles: set })).join(), /not a profile/);
});

test("a profile that fails the schema lists every problem", () => {
  const broken = { ...testLocal, env: "nowhere", adapters: { ...testLocal.adapters, cache: "kv", database: "mongo" }, allowedHosts: "x" };
  const problems = problemsOf(compose({ env: { APP_ENV: "local" }, profiles: { ...set, local: broken } }));
  assert.equal(problems.length >= 4, true, problems.join("\n"));
  assert.equal(problems.some((p) => /adapters\.cache/.test(p)), true);
  assert.equal(problems.some((p) => /adapters\.database/.test(p)), true);
});

test("local with a non-local host does not start", () => {
  const local = { ...testLocal, allowedHosts: ["localhost", "db.example.com"] };
  const problems = problemsOf(compose({ env: { APP_ENV: "local" }, profiles: { ...set, local } }));
  assert.match(problems.join(), /local may only allow local hosts.*db\.example\.com/);
});

test("dev with a production host does not start", () => {
  const prod = { ...profiles.prod, allowedHosts: ["api.shop.com"] };
  const dev = { ...profiles.dev, allowedHosts: ["api.shop.com"] };
  const problems = problemsOf(compose({ env: { APP_ENV: "dev", DATABASE_PATH: join(tmp, "d.db"), STORAGE_PATH: join(tmp, "d") }, profiles: { ...set, dev, prod } }));
  assert.match(problems.join(), /dev lists production host\(s\): api\.shop\.com/);
});

test("an adapter that is not registered, or reaches a host the profile does not allow, stops startup", () => {
  const withoutSqlite = { ...registry, database: { memory: registry.database.memory! } };
  assert.match(
    problemsOf(compose({ env: { APP_ENV: "local" }, profiles: set, registry: withoutSqlite })).join(),
    /database adapter "sqlite", which is not registered/,
  );
  const remote = { ...registry, database: { ...registry.database, sqlite: { hosts: ["db.remote.io"], create: registry.database.sqlite!.create } } };
  assert.match(
    problemsOf(compose({ env: { APP_ENV: "local" }, profiles: set, registry: remote })).join(),
    /reaches db\.remote\.io, which profile local does not allow/,
  );
});

test("dev and prod need their own paths from the environment", () => {
  const problems = problemsOf(compose({ env: { APP_ENV: "dev" }, profiles: set }));
  assert.match(problems.join(), /DATABASE_PATH must be set/);
  assert.match(problems.join(), /STORAGE_PATH must be set/);
});

test("dev must not reuse the local paths", () => {
  const env = { APP_ENV: "dev", DATABASE_PATH: testLocal.paths.database, STORAGE_PATH: testLocal.paths.storage };
  const problems = problemsOf(compose({ env, profiles: set }));
  assert.match(problems.join(), /must not use the local database path/);
  assert.match(problems.join(), /must not use the local storage path/);
});

test("a valid profile builds working ports", async () => {
  const r = compose({ env: { APP_ENV: "local", APP_NAME: "demo" }, profiles: set });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const { ports, app, profile } = r.value;
  assert.equal(app, "demo");
  assert.equal(profile.env, "local");
  assert.equal(ports.database.name, "sqlite");
  assert.equal((await ports.database.health()).ok, true);
  assert.equal(typeof ports.ids.next(), "string");
  assert.match(ports.clock.now(), /Z$/);
  const put = await ports.storage.put("a/b.txt", new Uint8Array([1]), { contentType: "text/plain" });
  assert.equal(put.ok, true);
});

test("the shipped dev profile builds with its paths from the environment", async () => {
  const env = { APP_ENV: "dev", DATABASE_PATH: join(tmp, "dev", "app.db"), STORAGE_PATH: join(tmp, "dev", "files") };
  const r = compose({ env });
  assert.equal(r.ok, true, JSON.stringify(r));
  if (r.ok) assert.equal((await r.value.ports.database.health()).ok, true);
});

test("composeOrThrow reports all problems in one error", () => {
  assert.throws(
    () => composeOrThrow({ env: { APP_ENV: "dev" }, profiles: set }),
    (e: unknown) => e instanceof Error && /Startup stopped\. 2 problem\(s\)/.test(e.message) && /DATABASE_PATH/.test(e.message) && /STORAGE_PATH/.test(e.message),
  );
});
