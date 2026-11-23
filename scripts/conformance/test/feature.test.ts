import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { change, listFeatures, runCli, showFeature } from "../feature.ts";
import { makeProject } from "./helpers.ts";

const STUB = 'export { default } from "../../features/shop/page.tsx";';
const LIST = `import type { FeatureModule } from "../lib/feature.ts";
import { shopFeature } from "../features/shop/index.ts";
import { blogFeature } from "../features/blog/index.ts";

export const features: readonly FeatureModule[] = [
  shopFeature,
  blogFeature,
];
`;

const files = (): Record<string, string> => ({
  ".gitignore": ".conformance/\n",
  "src/app/features.ts": LIST,
  "src/app/shop/page.tsx": `${STUB}\n`,
  "src/features/shop/index.ts": "export const shopFeature = { name: 'shop', collections: [] };\n",
  "src/features/shop/page.tsx": "export default function Page() { return null; }\n",
  "src/features/shop/steps/pure/shop.price.ts": "import { fmt } from '../../../../shared/steps/pure/fmt.ts';\nexport const price = fmt;\n",
  "src/features/shop/feature.json": JSON.stringify({ name: "shop", module: "shopFeature", routes: [{ stub: "src/app/shop/page.tsx", content: STUB }] }, null, 2),
  "src/features/blog/index.ts": "export const blogFeature = { name: 'blog', collections: [] };\n",
  "src/features/blog/feature.json": JSON.stringify({ name: "blog", module: "blogFeature", routes: [] }, null, 2),
  "src/shared/steps/pure/fmt.ts": "export const fmt = 1;\n",
});

function project(extra: Record<string, string> = {}, commit = true) {
  const p = makeProject({ ...files(), ...extra });
  const g = (...a: string[]) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: p.dir, encoding: "utf8" });
  if (commit) {
    g("init", "-q", "-b", "main");
    g("add", "-A");
    g("commit", "-q", "-m", "base");
  }
  const read = (rel: string): string => readFileSync(join(p.dir, rel), "utf8");
  return { ...p, g, read, has: (rel: string) => existsSync(join(p.dir, rel)) };
}

test("list shows each feature, its state, strips, steps and stubs", () => {
  const p = project();
  try {
    const r = listFeatures(p.dir);
    assert.equal(r.ok, true);
    assert.match(r.message, /shop: enabled[\s\S]*route stubs: src\/app\/shop\/page\.tsx/);
    assert.match(r.message, /blog: enabled/);
    assert.match(r.message, /steps: pure\/shop\.price\.ts/);
  } finally {
    p.cleanup();
  }
});

test("show lists the shared steps it uses, its stub and its list entry", () => {
  const p = project({ "src/lib/uses-shop.ts": "import { shopFeature } from '../features/shop/index.ts';\nexport const x = shopFeature;\n" });
  try {
    const r = showFeature(p.dir, "shop");
    assert.match(r.message, /shared steps it uses: src\/shared\/steps\/pure\/fmt\.ts/);
    assert.match(r.message, /route stubs: src\/app\/shop\/page\.tsx/);
    assert.match(r.message, /feature list entry: src\/app\/features\.ts/);
    assert.match(r.message, /src\/lib\/uses-shop\.ts imports src\/features\/shop\/index\.ts/);
    assert.equal(showFeature(p.dir, "nope").ok, false);
  } finally {
    p.cleanup();
  }
});

test("disable prints a plan and changes nothing without --yes", () => {
  const p = project();
  try {
    const r = change(p.dir, "disable", "shop", false);
    assert.equal(r.ok, true);
    assert.match(r.message, /delete src\/app\/shop\/page\.tsx/);
    assert.match(r.message, /Nothing was changed/);
    assert.equal(p.has("src/app/shop/page.tsx"), true);
    assert.equal(p.read("src/app/features.ts"), LIST);
  } finally {
    p.cleanup();
  }
});

test("disable removes the stub and the list lines but keeps the folder, and enable restores everything exactly", () => {
  const p = project();
  try {
    assert.equal(change(p.dir, "disable", "shop", true).ok, true);
    assert.equal(p.has("src/app/shop/page.tsx"), false);
    assert.equal(p.has("src/features/shop/index.ts"), true);
    const list = p.read("src/app/features.ts");
    assert.doesNotMatch(list, /shopFeature/);
    assert.match(list, /blogFeature/);
    assert.match(listFeatures(p.dir).message, /shop: disabled/);

    p.g("add", "-A");
    p.g("commit", "-q", "-m", "disable shop");
    assert.equal(change(p.dir, "enable", "shop", true).ok, true);
    assert.equal(p.read("src/app/shop/page.tsx").trim(), STUB);
    assert.match(p.read("src/app/features.ts"), /import \{ shopFeature \} from "..\/features\/shop\/index\.ts";/);
    assert.match(p.read("src/app/features.ts"), /^\s+shopFeature,$/m);
    assert.match(listFeatures(p.dir).message, /shop: enabled/);
  } finally {
    p.cleanup();
  }
});

test("disable refuses while other code refers to the feature, and lists it", () => {
  const p = project({ "src/lib/uses-shop.ts": "import { shopFeature } from '../features/shop/index.ts';\nexport const x = shopFeature;\n" });
  try {
    const r = change(p.dir, "disable", "shop", true);
    assert.equal(r.ok, false);
    assert.match(r.message, /other files refer to it[\s\S]*src\/lib\/uses-shop\.ts imports src\/features\/shop\/index\.ts/);
    assert.equal(p.has("src/app/shop/page.tsx"), true);
  } finally {
    p.cleanup();
  }
});

test("enable refuses when a stub path holds a different file", () => {
  const p = project();
  try {
    change(p.dir, "disable", "shop", true);
    p.g("add", "-A");
    p.g("commit", "-q", "-m", "disable");
    p.write("src/app/shop/page.tsx", "export default function Mine() { return null; }\n");
    p.g("add", "-A");
    p.g("commit", "-q", "-m", "mine");
    const r = change(p.dir, "enable", "shop", true);
    assert.equal(r.ok, false);
    assert.match(r.message, /src\/app\/shop\/page\.tsx already exists and holds something else/);
  } finally {
    p.cleanup();
  }
});

test("prune refuses an enabled feature, and deletes a disabled one", () => {
  const p = project();
  try {
    const refused = change(p.dir, "prune", "shop", true);
    assert.equal(refused.ok, false);
    assert.match(refused.message, /it is enabled/);
    assert.equal(p.has("src/features/shop/index.ts"), true);

    change(p.dir, "disable", "shop", true);
    p.g("add", "-A");
    p.g("commit", "-q", "-m", "disable");
    const planOnly = change(p.dir, "prune", "shop", false);
    assert.match(planOnly.message, /delete the folder src\/features\/shop\//);
    assert.equal(p.has("src/features/shop/index.ts"), true);

    const r = change(p.dir, "prune", "shop", true);
    assert.equal(r.ok, true, r.message);
    assert.equal(p.has("src/features/shop"), false);
    assert.match(r.message, /Shared steps no feature uses any more[\s\S]*src\/shared\/steps\/pure\/fmt\.ts/);
    assert.equal(p.has("src/features/blog/index.ts"), true);
  } finally {
    p.cleanup();
  }
});

test("a change refuses when git shows uncommitted changes in the files it would touch", () => {
  const p = project();
  try {
    p.write("src/app/features.ts", `${LIST}// edited\n`);
    const r = change(p.dir, "disable", "shop", true);
    assert.equal(r.ok, false);
    assert.match(r.message, /uncommitted changes/);
    assert.equal(p.has("src/app/shop/page.tsx"), true);
  } finally {
    p.cleanup();
  }
});

test("a change refuses outside a git repository", () => {
  const p = project({}, false);
  try {
    const r = change(p.dir, "disable", "shop", true);
    assert.equal(r.ok, false);
    assert.match(r.message, /not a git repository/);
  } finally {
    p.cleanup();
  }
});

test("a feature list in another format is not edited", () => {
  const p = project({ "src/app/features.ts": "export const features = [shopFeature, blogFeature];\nimport { shopFeature } from '../features/shop/index.ts';\n" });
  try {
    const r = change(p.dir, "disable", "shop", true);
    assert.equal(r.ok, false);
    assert.match(r.message, /one-entry-per-line format/);
  } finally {
    p.cleanup();
  }
});

test("a bad manifest is reported, not guessed at", () => {
  const p = project({ "src/features/shop/feature.json": JSON.stringify({ name: "other", module: "shopFeature", routes: [] }) });
  try {
    assert.match(change(p.dir, "disable", "shop", true).message, /"name" is "other", but the folder is "shop"/);
    assert.match(listFeatures(p.dir).message, /shop: manifest problem/);
  } finally {
    p.cleanup();
  }
  const q = project({ "src/features/shop/feature.json": JSON.stringify({ name: "shop", module: "shopFeature", routes: [{ stub: "src/lib/x.ts", content: "" }] }) });
  try {
    assert.match(change(q.dir, "disable", "shop", true).message, /must be a file inside src\/app\//);
  } finally {
    q.cleanup();
  }
});

test("the command line parses commands, --yes and --root, and prints usage otherwise", () => {
  const p = project();
  try {
    assert.equal(runCli(["list", "--root", p.dir], "/").ok, true);
    assert.match(runCli(["disable", "shop", "--root", p.dir], "/").message, /Nothing was changed/);
    assert.equal(runCli(["bogus"], p.dir).ok, false);
    assert.match(runCli([], p.dir).message, /Usage: pnpm feature/);
  } finally {
    p.cleanup();
  }
});
