// The feature command: see, disable, enable and prune features (feature layout design, section 5).
// Usage: node scripts/conformance/feature.ts <list|show|disable|enable|prune> [<name>] [--yes] [--root <dir>]
//
// A feature lives in src/features/<name>/ with a feature.json manifest. It is `enabled` when the app's feature list
// (src/app/features.ts) has its entry and its route stubs exist, and `disabled` when neither does.
// Commands that change files print their plan and change nothing without --yes, and refuse when git shows
// uncommitted changes in the files they would touch, so git can always undo them.
// References between files are found by reading relative import specifiers (a text scan, not the compiler).

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { loadConfig, type Config } from "./config.ts";
import { featureFolders } from "./layout.ts";
import { isInside } from "./project.ts";

export type CommandResult = { ok: boolean; message: string };
export type Manifest = { name: string; module: string; routes: { stub: string; content: string }[] };
export type FeatureState = "enabled" | "disabled" | "inconsistent";

const fail = (message: string): CommandResult => ({ ok: false, message });
const done = (message: string): CommandResult => ({ ok: true, message });

// ---- reading the project ----------------------------------------------------

function listFile(config: Config): string {
  return `${posix.dirname(config.folders.features)}/app/features.ts`;
}

function walk(root: string, rel: string, out: string[] = []): string[] {
  const abs = join(root, rel);
  if (!existsSync(abs)) return out;
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const child = `${rel}/${e.name}`;
    if (e.isDirectory()) walk(root, child, out);
    else out.push(child);
  }
  return out;
}

const SOURCE = /\.(ts|tsx)$/;
const SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"']*)["']/g;

/** Relative imports of a file, resolved to repo-relative paths. */
function importsOfFile(root: string, file: string): string[] {
  const text = readFileSync(join(root, file), "utf8");
  const out: string[] = [];
  for (const m of text.matchAll(SPEC)) out.push(posix.normalize(posix.join(posix.dirname(file), m[1] as string)));
  return out;
}

function sourceFiles(root: string, config: Config): string[] {
  return config.sourceRoots.flatMap((r) => walk(root, r)).filter((f) => SOURCE.test(f));
}

export function readManifest(root: string, config: Config, name: string): Manifest | string {
  const file = `${config.folders.features}/${name}/feature.json`;
  if (!existsSync(join(root, file))) return `${file} does not exist`;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(root, file), "utf8"));
  } catch {
    return `${file} is not valid JSON`;
  }
  const m = raw as Partial<Manifest> | null;
  if (!m || typeof m !== "object") return `${file} is not an object`;
  if (m.name !== name) return `${file}: "name" is ${JSON.stringify(m.name)}, but the folder is "${name}"`;
  if (typeof m.module !== "string" || !/^[A-Za-z_$][\w$]*$/.test(m.module)) return `${file}: "module" must be the exported name of the feature module`;
  if (!Array.isArray(m.routes)) return `${file}: "routes" must be a list`;
  const appDir = `${posix.dirname(config.folders.features)}/app/`;
  for (const r of m.routes) {
    if (!r || typeof r.stub !== "string" || typeof r.content !== "string") return `${file}: each route needs "stub" and "content" as text`;
    if (!r.stub.startsWith(appDir) || r.stub.includes("..")) return `${file}: route stub ${r.stub} must be a file inside ${appDir}`;
  }
  return m as Manifest;
}

type Refs = { stubs: string[]; list: string[]; other: { file: string; spec: string }[] };

function referencesTo(root: string, config: Config, name: string, manifest: Manifest | null): Refs {
  const dir = `${config.folders.features}/${name}`;
  const stubPaths = new Set((manifest?.routes ?? []).map((r) => r.stub));
  const list = listFile(config);
  const refs: Refs = { stubs: [], list: [], other: [] };
  for (const file of sourceFiles(root, config)) {
    if (isInside(file, dir)) continue;
    for (const target of importsOfFile(root, file)) {
      if (!isInside(target, dir)) continue;
      if (stubPaths.has(file)) refs.stubs.push(file);
      else if (file === list) refs.list.push(file);
      else refs.other.push({ file, spec: target });
      break;
    }
  }
  return refs;
}

function listParts(config: Config, root: string): { text: string; ok: boolean } {
  const file = join(root, listFile(config));
  if (!existsSync(file)) return { text: "", ok: false };
  return { text: readFileSync(file, "utf8"), ok: true };
}

const ARRAY = /(export const features[^=]*=\s*\[\n)([\s\S]*?)(\];)/;

function importLineRe(config: Config, name: string): RegExp {
  const target = `../${posix.basename(config.folders.features)}/${name}/index.ts`;
  return new RegExp(`^import [^\\n]*from ["']${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'];?\\s*$`, "m");
}

function isListed(config: Config, root: string, name: string, manifest: Manifest): boolean {
  const { text } = listParts(config, root);
  return importLineRe(config, name).test(text) && new RegExp(`^\\s*${manifest.module},\\s*$`, "m").test(text);
}

function stubStatus(root: string, manifest: Manifest): { present: number; matching: number } {
  let present = 0;
  let matching = 0;
  for (const r of manifest.routes) {
    const abs = join(root, r.stub);
    if (!existsSync(abs)) continue;
    present += 1;
    if (readFileSync(abs, "utf8").trim() === r.content.trim()) matching += 1;
  }
  return { present, matching };
}

export function stateOf(root: string, config: Config, name: string, manifest: Manifest): FeatureState {
  const listed = isListed(config, root, name, manifest);
  const { present, matching } = stubStatus(root, manifest);
  if (listed && matching === manifest.routes.length) return "enabled";
  if (!listed && present === 0) return "disabled";
  return "inconsistent";
}

function folderListing(root: string, config: Config, name: string): { steps: string[]; strips: string[] } {
  const base = `${config.folders.features}/${name}`;
  const files = walk(root, base);
  const clean = (f: string): string => f.slice(base.length + 1);
  return {
    steps: files.filter((f) => /\/steps\/[^/]+\/[^/]+\.ts$/.test(f) && !f.endsWith(".test.ts")).map(clean).sort(),
    strips: files.filter((f) => /\/strips\/[^/]+\.strip\.ts$/.test(f)).map(clean).sort(),
  };
}

// ---- git --------------------------------------------------------------------

function git(root: string, ...args: string[]): { ok: boolean; out: string } {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim() };
}

/** A message when the paths have uncommitted changes (or there is no git), otherwise null. */
function dirtyMessage(root: string, paths: string[]): string | null {
  if (!git(root, "rev-parse", "--is-inside-work-tree").ok) return "this is not a git repository, so the change could not be undone. Run `git init` first";
  const r = git(root, "status", "--porcelain", "--", ...paths);
  if (r.out !== "") return `uncommitted changes in the files this would touch. Commit or stash them first, so git can undo this:\n${r.out}`;
  return null;
}

// ---- commands ---------------------------------------------------------------

export function listFeatures(root: string): CommandResult {
  const config = loadConfig(root);
  const names = featureFolders(root, config.folders);
  if (names.length === 0) return done("No features.");
  const lines: string[] = [];
  for (const name of names) {
    const m = readManifest(root, config, name);
    const { steps, strips } = folderListing(root, config, name);
    if (typeof m === "string") {
      lines.push(`${name}: manifest problem: ${m}`, `  strips: ${strips.length}, steps: ${steps.length}`);
      continue;
    }
    lines.push(
      `${name}: ${stateOf(root, config, name, m)}`,
      `  strips: ${strips.map((s) => s.replace(/^strips\/|\.strip\.ts$/g, "")).join(", ") || "-"}`,
      `  steps: ${steps.map((s) => s.replace(/^steps\//, "")).join(", ") || "-"}`,
      `  route stubs: ${m.routes.map((r) => r.stub).join(", ") || "-"}`,
    );
  }
  return done(lines.join("\n"));
}

function sharedStepsUsedBy(root: string, config: Config, name: string): string[] {
  const dir = `${config.folders.features}/${name}`;
  const shared = `${config.folders.shared}/steps`;
  const used = new Set<string>();
  for (const file of walk(root, dir).filter((f) => SOURCE.test(f))) {
    for (const target of importsOfFile(root, file)) if (isInside(target, shared)) used.add(target);
  }
  return [...used].sort();
}

export function showFeature(root: string, name: string): CommandResult {
  const config = loadConfig(root);
  if (!featureFolders(root, config.folders).includes(name)) return fail(`there is no feature "${name}" in ${config.folders.features}/`);
  const m = readManifest(root, config, name);
  const manifest = typeof m === "string" ? null : m;
  const { steps, strips } = folderListing(root, config, name);
  const refs = referencesTo(root, config, name, manifest);
  const lines = [
    `feature ${name}: ${manifest ? stateOf(root, config, name, manifest) : `manifest problem: ${m as string}`}`,
    `  files: ${walk(root, `${config.folders.features}/${name}`).length}`,
    `  strips: ${strips.join(", ") || "-"}`,
    `  steps: ${steps.join(", ") || "-"}`,
    `  shared steps it uses: ${sharedStepsUsedBy(root, config, name).join(", ") || "-"}`,
    `  route stubs: ${refs.stubs.join(", ") || "-"}`,
    `  feature list entry: ${refs.list.length > 0 ? listFile(config) : "-"}`,
    `  other files that refer to it: ${refs.other.length === 0 ? "-" : ""}`,
    ...refs.other.map((r) => `    ${r.file} imports ${r.spec}`),
  ];
  return done(lines.join("\n"));
}

type Action =
  | { kind: "delete-file"; file: string }
  | { kind: "write-file"; file: string; content: string }
  | { kind: "edit-list"; mode: "add" | "remove" }
  | { kind: "delete-dir"; dir: string };

const describe = (a: Action, config: Config): string =>
  a.kind === "delete-file" ? `delete ${a.file}` : a.kind === "write-file" ? `write ${a.file}` : a.kind === "delete-dir" ? `delete the folder ${a.dir}/` : `${a.mode === "add" ? "add the import and entry to" : "remove the import and entry from"} ${listFile(config)}`;

function editList(root: string, config: Config, name: string, manifest: Manifest, mode: "add" | "remove"): string | null {
  const file = join(root, listFile(config));
  const text = readFileSync(file, "utf8");
  if (!ARRAY.test(text)) return `${listFile(config)} is not in the one-entry-per-line format, so it cannot be edited by this command`;
  const importRe = importLineRe(config, name);
  const entryRe = new RegExp(`^\\s*${manifest.module},\\s*\\n`, "m");
  let out = text;
  if (mode === "remove") {
    out = out.replace(importRe, "").replace(/\n{3,}/g, "\n\n");
    out = out.replace(entryRe, "");
  } else {
    const importLine = `import { ${manifest.module} } from "../${posix.basename(config.folders.features)}/${name}/index.ts";`;
    const lines = out.split("\n");
    let lastImport = -1;
    lines.forEach((l, i) => {
      if (/^import /.test(l)) lastImport = i;
    });
    lines.splice(lastImport + 1, 0, importLine);
    out = lines.join("\n").replace(ARRAY, (_m, head: string, body: string, tail: string) => `${head}${body}  ${manifest.module},\n${tail}`);
  }
  writeFileSync(file, out);
  return null;
}

function execute(root: string, config: Config, name: string, manifest: Manifest, actions: Action[]): void {
  for (const a of actions) {
    if (a.kind === "delete-file") rmSync(join(root, a.file), { force: true });
    else if (a.kind === "delete-dir") rmSync(join(root, a.dir), { recursive: true, force: true });
    else if (a.kind === "write-file") {
      mkdirSync(dirname(join(root, a.file)), { recursive: true });
      writeFileSync(join(root, a.file), a.content.endsWith("\n") ? a.content : `${a.content}\n`);
    } else {
      const problem = editList(root, config, name, manifest, a.mode);
      if (problem) throw new Error(problem);
    }
  }
}

export function change(root: string, op: "disable" | "enable" | "prune", name: string, yes: boolean): CommandResult {
  const config = loadConfig(root);
  if (!featureFolders(root, config.folders).includes(name)) return fail(`there is no feature "${name}" in ${config.folders.features}/`);
  const m = readManifest(root, config, name);
  if (typeof m === "string") return fail(`cannot ${op} "${name}": ${m}`);
  const state = stateOf(root, config, name, m);
  const dir = `${config.folders.features}/${name}`;
  const refs = referencesTo(root, config, name, m);
  const actions: Action[] = [];
  const touched: string[] = [];

  if (op === "disable") {
    if (state === "disabled") return fail(`"${name}" is already disabled`);
    if (refs.other.length > 0) {
      return fail(`cannot disable "${name}": other files refer to it:\n${refs.other.map((r) => `  ${r.file} imports ${r.spec}`).join("\n")}\nRemove those references first.`);
    }
    for (const r of m.routes) if (existsSync(join(root, r.stub))) actions.push({ kind: "delete-file", file: r.stub });
    actions.push({ kind: "edit-list", mode: "remove" });
    touched.push(...m.routes.map((r) => r.stub), listFile(config));
  } else if (op === "enable") {
    if (state === "enabled") return fail(`"${name}" is already enabled`);
    for (const r of m.routes) {
      const abs = join(root, r.stub);
      if (existsSync(abs) && readFileSync(abs, "utf8").trim() !== r.content.trim()) {
        return fail(`cannot enable "${name}": ${r.stub} already exists and holds something else. Move or delete it first.`);
      }
      actions.push({ kind: "write-file", file: r.stub, content: r.content });
    }
    if (!isListed(config, root, name, m)) actions.push({ kind: "edit-list", mode: "add" });
    touched.push(...m.routes.map((r) => r.stub), listFile(config));
  } else {
    if (state !== "disabled") return fail(`cannot prune "${name}": it is ${state}. Run \`pnpm feature disable ${name} --yes\` first.`);
    if (refs.other.length > 0) {
      return fail(`cannot prune "${name}": other files refer to it:\n${refs.other.map((r) => `  ${r.file} imports ${r.spec}`).join("\n")}`);
    }
    actions.push({ kind: "delete-dir", dir });
    touched.push(dir);
  }

  const header = `${op} ${name} (${state}):`;
  const plan = actions.map((a) => `  - ${describe(a, config)}`).join("\n");
  if (!yes) return done(`${header}\n${plan}\nNothing was changed. Run again with --yes to do it.`);

  const dirty = dirtyMessage(root, touched);
  if (dirty) return fail(`cannot ${op} "${name}": ${dirty}`);

  const before = op === "prune" ? sharedUsers(root, config) : null;
  try {
    execute(root, config, name, m, actions);
  } catch (e) {
    return fail(`${op} "${name}" failed part way: ${e instanceof Error ? e.message : String(e)}. Use git to see and undo what changed.`);
  }
  let extra = "";
  if (op === "prune" && before) {
    const unused = unusedSharedSteps(root, config);
    extra = unused.length > 0 ? `\nShared steps no feature uses any more (kept, delete them if you do not need them):\n${unused.map((u) => `  ${u}`).join("\n")}` : "";
  }
  return done(`${header}\n${plan}\nDone. \`git diff\` shows exactly what changed.${extra}`);
}

function sharedUsers(root: string, config: Config): Map<string, Set<string>> {
  const shared = `${config.folders.shared}/steps`;
  const users = new Map<string, Set<string>>();
  for (const f of walk(root, shared).filter((x) => SOURCE.test(x) && !x.endsWith(".test.ts"))) users.set(f, new Set());
  for (const file of sourceFiles(root, config)) {
    for (const t of importsOfFile(root, file)) users.get(t)?.add(file);
  }
  return users;
}

function unusedSharedSteps(root: string, config: Config): string[] {
  return [...sharedUsers(root, config)].filter(([, users]) => [...users].every((u) => isInside(u, config.folders.shared))).map(([f]) => f).sort();
}

// ---- command line -----------------------------------------------------------

export function runCli(argv: string[], cwd: string): CommandResult {
  const args = argv.filter((a) => !a.startsWith("--"));
  const yes = argv.includes("--yes");
  const rootIdx = argv.indexOf("--root");
  const root = resolve(rootIdx >= 0 ? (argv[rootIdx + 1] ?? cwd) : cwd);
  const args2 = rootIdx >= 0 ? args.filter((a) => a !== argv[rootIdx + 1]) : args;
  const [cmd, name] = args2;
  const usage = "Usage: pnpm feature <list | show <name> | disable <name> | enable <name> | prune <name>> [--yes]";
  try {
    if (cmd === "list") return listFeatures(root);
    if (cmd === "show" && name) return showFeature(root, name);
    if ((cmd === "disable" || cmd === "enable" || cmd === "prune") && name) return change(root, cmd, name, yes);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
  return fail(usage);
}

if (import.meta.main) {
  const r = runCli(process.argv.slice(2), process.cwd());
  (r.ok ? process.stdout : process.stderr).write(`${r.message}\n`);
  process.exit(r.ok ? 0 : 1);
}

