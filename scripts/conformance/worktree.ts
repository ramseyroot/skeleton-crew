// One git worktree per parallel task (requirement 23).
// Usage: node scripts/conformance/worktree.ts <create|verify|merge|remove|list> [<task-id>] [--spec <name>] [--force] [--no-install] [--root <dir>]

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runChecks } from "./check.ts";
import { loadConfig, type Config } from "./config.ts";
import { showAtHead } from "./git.ts";
import { activePlans } from "./plans.ts";
import { covers, parseTasks, type Task } from "./tasks.ts";

export type WtResult = { ok: boolean; message: string };

type State = Record<string, { spec: string; base: string; path: string; branch: string; created: string; verifiedTip?: string }>;

const ok = (message: string): WtResult => ({ ok: true, message });
const fail = (message: string): WtResult => ({ ok: false, message });

function g(cwd: string, ...args: string[]): { ok: boolean; out: string; err: string } {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}

function statePath(root: string, config: Config): string {
  return join(root, config.output.reportDir, "worktrees.json");
}
function loadState(root: string, config: Config): State {
  try {
    return JSON.parse(readFileSync(statePath(root, config), "utf8")) as State;
  } catch {
    return {};
  }
}
function saveState(root: string, config: Config, s: State): void {
  mkdirSync(join(root, config.output.reportDir), { recursive: true });
  writeFileSync(statePath(root, config), JSON.stringify(s, null, 2) + "\n");
}

/** Task worktrees git knows about: branch task/<id> -> path. */
function openWorktrees(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const r = g(root, "worktree", "list", "--porcelain");
  let path = "";
  for (const line of r.out.split("\n")) {
    if (line.startsWith("worktree ")) path = line.slice(9);
    const m = /^branch refs\/heads\/task\/(.+)$/.exec(line);
    if (m) out.set(m[1] as string, path);
  }
  return out;
}

/** The spec whose committed tasks.md is used: --spec, or the only spec with an active committed plan. */
function pickSpec(root: string, config: Config, spec: string | null): { spec: string; tasks: Task[] } | WtResult {
  let name = spec;
  if (!name) {
    const specs = activePlans(root, config.specsFolder).map((p) => p.path.split("/").slice(-2, -1)[0] as string);
    if (specs.length !== 1) return fail(`found ${specs.length} specs with an active committed change plan. Pass --spec <name>`);
    name = specs[0] as string;
  }
  const text = showAtHead(root, `${config.specsFolder}/${name}/tasks.md`);
  if (text === null) return fail(`${config.specsFolder}/${name}/tasks.md is not committed`);
  return { spec: name, tasks: parseTasks(text) };
}

function changedOnBranch(root: string, base: string, branch: string): string[] {
  const r = g(root, "diff", "--name-only", `${base}...${branch}`);
  return r.out.split("\n").filter(Boolean).sort();
}

export type WtOptions = { root: string; spec?: string | null; force?: boolean; install?: boolean };

export function create(id: string, o: WtOptions): WtResult {
  const root = resolve(o.root);
  const config = loadConfig(root);
  const picked = pickSpec(root, config, o.spec ?? null);
  if ("ok" in picked) return picked;
  const task = picked.tasks.find((t) => t.id === id);
  if (!task) return fail(`task ${id} is not in the committed tasks.md of spec ${picked.spec}`);
  if (task.done) return fail(`task ${id} is already done`);
  if (task.sequential) return fail(`task ${id} is sequential. Sequential tasks run in the main tree, one at a time`);
  if (task.writes === null) return fail(`task ${id} has no Writes: list`);
  if (g(root, "status", "--porcelain").out !== "") return fail("the main tree has uncommitted changes. Commit the sequential phase before starting parallel work");
  const open = openWorktrees(root);
  if (open.has(id)) return fail(`task ${id} already has a worktree at ${open.get(id)}`);
  if (open.size >= config.worktrees.maxParallel) {
    return fail(`${open.size} task worktrees are open (limit ${config.worktrees.maxParallel}). Merge or remove one first`);
  }
  const rel = `${config.worktrees.folder}/task-${id}`;
  const base = g(root, "rev-parse", "HEAD").out;
  const add = g(root, "worktree", "add", "-q", rel, "-b", `task/${id}`, base);
  if (!add.ok) return fail(`git worktree add failed: ${add.err}`);
  const path = join(root, rel);
  let installNote = "dependencies not installed (--no-install)";
  if ((o.install ?? true) && existsSync(join(path, "package.json"))) {
    const off = spawnSync("pnpm", ["install", "--offline", "--frozen-lockfile"], { cwd: path, encoding: "utf8" });
    const r = off.status === 0 ? off : spawnSync("pnpm", ["install", "--frozen-lockfile"], { cwd: path, encoding: "utf8" });
    installNote = r.status === 0 ? (off.status === 0 ? "dependencies linked from the pnpm store (offline)" : "dependencies installed") : `pnpm install failed: ${(r.stderr ?? "").trim().split("\n").pop()}`;
  }
  const state = loadState(root, config);
  state[id] = { spec: picked.spec, base, path: rel, branch: `task/${id}`, created: new Date().toISOString() };
  saveState(root, config, state);
  return ok(`task ${id}: worktree ${rel} on branch task/${id} from ${base.slice(0, 7)}; ${installNote}.\nThe task may write only: ${task.writes.join(", ")}`);
}

export function verify(id: string, o: WtOptions): WtResult {
  const root = resolve(o.root);
  const config = loadConfig(root);
  const state = loadState(root, config);
  const entry = state[id];
  if (!entry || !openWorktrees(root).has(id)) return fail(`task ${id} has no open worktree`);
  const path = join(root, entry.path);
  if (g(path, "status", "--porcelain").out !== "") return fail(`the worktree for task ${id} has uncommitted changes. Commit them on branch ${entry.branch} first`);
  const picked = pickSpec(root, config, entry.spec);
  if ("ok" in picked) return picked;
  const task = picked.tasks.find((t) => t.id === id);
  const writes = task?.writes ?? [];
  const changed = changedOnBranch(root, entry.base, entry.branch);
  if (changed.length === 0) return fail(`branch ${entry.branch} has no changes yet`);
  const outside = changed.filter((f) => !writes.some((w) => covers(w, f)));
  if (outside.length > 0) return fail(`branch ${entry.branch} changed files outside task ${id}'s Writes list: ${outside.join(", ")}`);
  const check = runChecks(path);
  if (check.exitCode !== 0) return fail(`the check failed inside the worktree:\n${check.output}`);
  entry.verifiedTip = g(root, "rev-parse", entry.branch).out;
  saveState(root, config, state);
  return ok(`task ${id} verified: ${changed.length} file(s), all in its Writes list, and the check passes in the worktree`);
}

export function merge(id: string, o: WtOptions): WtResult {
  const root = resolve(o.root);
  const config = loadConfig(root);
  const state = loadState(root, config);
  const entry = state[id];
  if (!entry) return fail(`task ${id} has no worktree record`);
  const tip = g(root, "rev-parse", entry.branch).out;
  if (!entry.verifiedTip || entry.verifiedTip !== tip) return fail(`task ${id} must pass verify on its current commit before merging`);
  const picked = pickSpec(root, config, entry.spec);
  if ("ok" in picked) return picked;
  const order = picked.tasks.findIndex((t) => t.id === id);
  const open = openWorktrees(root);
  const earlier = picked.tasks.filter((t, i) => i < order && !t.sequential && open.has(t.id)).map((t) => t.id);
  if (earlier.length > 0) return fail(`merge in task order: task(s) ${earlier.join(", ")} are still open. Merge or remove them first`);
  if (g(root, "status", "--porcelain").out !== "") return fail("the main tree has uncommitted changes. Commit or stash them before merging");
  const pre = g(root, "rev-parse", "HEAD").out;
  const m = g(root, "merge", "--no-ff", "-m", `merge task/${id}`, entry.branch);
  if (!m.ok) {
    const conflicts = g(root, "diff", "--name-only", "--diff-filter=U").out.split("\n").filter(Boolean);
    g(root, "merge", "--abort");
    return fail(`merging ${entry.branch} conflicts${conflicts.length ? ` in ${conflicts.join(", ")}` : ""}. The merge was aborted and the main branch is unchanged. This needs the user`);
  }
  const mergeCommit = g(root, "rev-parse", "HEAD").out;
  const check = runChecks(root);
  if (check.exitCode !== 0) {
    // Undo only the merge commit this command just made, and only if nothing else moved the branch.
    if (g(root, "rev-parse", "HEAD").out === mergeCommit && g(root, "status", "--porcelain").out === "") {
      g(root, "reset", "-q", "--hard", pre);
      return fail(`the check failed after merging ${entry.branch}, so the merge was undone (main is back at ${pre.slice(0, 7)}):\n${check.output}`);
    }
    return fail(`the check failed after merging ${entry.branch}, and the branch moved, so nothing was undone. This needs the user:\n${check.output}`);
  }
  return ok(`task ${id} merged into the main branch (${mergeCommit.slice(0, 7)}) and the check passes. Next: remove ${id}`);
}

export function remove(id: string, o: WtOptions): WtResult {
  const root = resolve(o.root);
  const config = loadConfig(root);
  const state = loadState(root, config);
  const open = openWorktrees(root);
  const path = open.get(id) ?? (state[id] ? join(root, state[id].path) : null);
  const branch = `task/${id}`;
  const exists = g(root, "rev-parse", "--verify", "--quiet", branch).ok;
  if (!path && !exists) return fail(`task ${id} has no worktree or branch`);
  const merged = exists && g(root, "merge-base", "--is-ancestor", branch, "HEAD").ok;
  if (exists && !merged && !o.force) return fail(`branch ${branch} has commits that are not merged. Merge it, or remove it with --force (the user decides)`);
  if (path && open.has(id)) {
    const r = g(root, "worktree", "remove", ...(o.force ? ["--force"] : []), path);
    if (!r.ok) return fail(`git worktree remove failed: ${r.err}`);
  }
  if (exists) g(root, "branch", o.force ? "-D" : "-d", branch);
  delete state[id];
  saveState(root, config, state);
  return ok(`task ${id}: worktree and branch removed${merged ? "" : " (unmerged work discarded)"}`);
}

export function list(o: WtOptions): WtResult {
  const root = resolve(o.root);
  const config = loadConfig(root);
  const state = loadState(root, config);
  const open = openWorktrees(root);
  if (open.size === 0) return ok("no task worktrees are open");
  const lines = [...open].map(([id, path]) => {
    const e = state[id];
    const tip = g(root, "rev-parse", `task/${id}`).out;
    const v = e?.verifiedTip === tip ? "verified" : "not verified";
    return `task ${id}: ${path} (${v})`;
  });
  return ok(lines.join("\n"));
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const flag = (n: string): boolean => args.includes(n);
  const value = (n: string): string | null => {
    const i = args.indexOf(n);
    return i >= 0 ? (args[i + 1] ?? null) : null;
  };
  const positional = args.filter((a, i) => !a.startsWith("--") && !["--spec", "--root"].includes(args[i - 1] ?? ""));
  const [cmd, id] = positional;
  const o: WtOptions = { root: value("--root") ?? process.cwd(), spec: value("--spec"), force: flag("--force"), install: !flag("--no-install") };
  const usage = "usage: worktree.ts <create|verify|merge|remove|list> [<task-id>] [--spec <name>] [--force] [--no-install]";
  let r: WtResult;
  if (cmd === "list") r = list(o);
  else if (!id || !["create", "verify", "merge", "remove"].includes(cmd ?? "")) {
    process.stderr.write(`${usage}\n`);
    process.exit(2);
  } else if (cmd === "create") r = create(id, o);
  else if (cmd === "verify") r = verify(id, o);
  else if (cmd === "merge") r = merge(id, o);
  else r = remove(id, o);
  process.stdout.write(`${r.message}\n`);
  process.exit(r.ok ? 0 : 1);
}

