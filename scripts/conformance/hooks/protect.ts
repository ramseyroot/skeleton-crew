// Kiro PreToolUse hook: block agent writes to protected files, unplanned edits to existing guarded
// files, and writes outside a worktree task's file list (requirements 12, 19, 24).
// Usage (hook commands): node scripts/conformance/hooks/protect.ts            (matcher: write)
//                        node scripts/conformance/hooks/protect.ts --shell    (matcher: shell)
//
// Exit codes, per Kiro's PreToolUse contract: 0 allows the call, 2 blocks it and returns STDERR to the
// agent. Any other code shows a warning and allows the call; this hook uses 1 when it cannot run, so a
// broken configuration never locks the agent out of fixing it.
// This file does not load the TypeScript compiler, so it stays fast.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { loadConfig, type Config } from "../config.ts";
import { isInside, matchGlob } from "../files.ts";
import { activePlans, planAllows } from "../plans.ts";
import { covers, parseTasks } from "../tasks.ts";

const UNLOCK_MINUTES = 30;
const PATH_KEYS = new Set(["path", "file_path", "filePath", "paths", "target", "source", "destination", "new_path", "old_path", "file", "files"]);

export type Decision = { block: boolean; message: string };

function git(root: string, ...args: string[]): { ok: boolean; out: string } {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim() };
}

/** Repo-relative form of a path, or null when it is outside the repository. */
function toRepo(root: string, cwd: string, p: string): string | null {
  const abs = isAbsolute(p) ? p : resolve(cwd, p);
  const rel = relative(root, abs);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return null;
  return rel.split(sep).join("/");
}

/** String values under path-like keys anywhere in the tool input. */
export function pathsFromInput(input: unknown): string[] {
  const out: string[] = [];
  const visit = (v: unknown, key: string | null): void => {
    if (typeof v === "string") {
      if (key !== null && PATH_KEYS.has(key)) out.push(v);
    } else if (Array.isArray(v)) {
      for (const x of v) visit(x, key);
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) visit(x, k);
    }
  };
  visit(input, null);
  return out;
}

function tokenize(segment: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(segment))) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}

/**
 * Paths a shell command would write, by pattern: redirection targets, and the file arguments of
 * tee, touch, rm, truncate, mv, sed -i, perl -i, cp/install/ln (destination), git checkout -- and git restore.
 * A guard against accidents, not a security boundary.
 */
export function shellWriteTargets(command: string): string[] {
  const targets: string[] = [];
  for (const segment of command.split(/&&|\|\||;|\||\n/)) {
    const words = tokenize(segment);
    for (let i = 0; i < words.length; i++) {
      const w = words[i] as string;
      const redir = /^\d?>>?(.*)$/.exec(w);
      if (redir) {
        const t = redir[1] || words[i + 1];
        if (t && !t.startsWith("&")) targets.push(t);
      }
    }
    // Drop redirections: output targets were collected above, and input files (< f) are only read.
    const args = words.filter((w, i) => !/^\d?>>?/.test(w) && !w.startsWith("<") && !/^\d?>>?$|^<$/.test(words[i - 1] ?? ""));
    const cmd = args[0] ?? "";
    const files = args.slice(1).filter((a) => !a.startsWith("-"));
    if (["tee", "touch", "rm", "truncate", "mv", "shred", "unlink"].includes(cmd)) targets.push(...files);
    else if (cmd === "sed" && args.some((a) => /^-[a-zA-Z]*i/.test(a))) targets.push(...files.slice(1));
    else if (cmd === "perl" && args.some((a) => /^-[a-zA-Z]*i/.test(a))) targets.push(...files.slice(1));
    else if (["cp", "install", "ln", "rsync"].includes(cmd) && files.length > 0) targets.push(files[files.length - 1] as string);
    else if (cmd === "git" && (args[1] === "checkout" || args[1] === "restore")) {
      const dd = args.indexOf("--");
      targets.push(...(dd >= 0 ? args.slice(dd + 1) : args.slice(2).filter((a) => !a.startsWith("-"))));
    }
  }
  return targets;
}

function unlocked(root: string, config: Config): boolean {
  const f = join(root, config.output.reportDir, "unlock");
  try {
    return Date.now() - statSync(f).mtimeMs < UNLOCK_MINUTES * 60_000;
  } catch {
    return false;
  }
}

function openTaskWorktrees(root: string): Set<string> {
  const ids = new Set<string>();
  for (const line of git(root, "worktree", "list", "--porcelain").out.split("\n")) {
    const m = /^branch refs\/heads\/task\/(.+)$/.exec(line);
    if (m) ids.add(m[1] as string);
  }
  return ids;
}

function existsAtHead(root: string, rel: string): boolean {
  return git(root, "cat-file", "-e", `HEAD:${rel}`).ok;
}

function taskWrites(root: string, config: Config, id: string): string[] | null {
  let spec: string | null = null;
  try {
    const state = JSON.parse(readFileSync(join(root, config.output.reportDir, "worktrees.json"), "utf8")) as Record<string, { spec?: string }>;
    spec = state[id]?.spec ?? null;
  } catch {
    spec = null;
  }
  if (!spec) return null;
  const text = git(root, "show", `HEAD:${config.specsFolder}/${spec}/tasks.md`);
  if (!text.ok) return null;
  return parseTasks(text.out).find((t) => t.id === id)?.writes ?? null;
}

/** Decides one write target (repo-relative). */
export function decide(root: string, config: Config, rel: string, ctx: { worktrees: Set<string>; unlocked: boolean; plans: ReturnType<typeof activePlans> | null }): Decision {
  const wtPrefix = `${config.worktrees.folder.replace(/\/+$/, "")}/task-`;
  let inner = rel;
  let task: string | null = null;
  if (rel.startsWith(wtPrefix)) {
    const rest = rel.slice(wtPrefix.length);
    const slash = rest.indexOf("/");
    task = slash >= 0 ? rest.slice(0, slash) : rest;
    inner = slash >= 0 ? rest.slice(slash + 1) : "";
  }

  if (config.protected.some((p) => matchGlob(inner, p)) && !ctx.unlocked) {
    return {
      block: true,
      message: `${inner} is a protected enforcement file. Do not change it yourself: tell the user what change you want and why. The user can allow edits for ${UNLOCK_MINUTES} minutes by running "touch ${config.output.reportDir}/unlock" in their own terminal.`,
    };
  }

  if (task !== null) {
    const writes = taskWrites(root, config, task);
    if (!writes) return { block: true, message: `${rel} is in the worktree for task ${task}, but that task's Writes list could not be found. Create worktrees with the worktree command.` };
    if (inner !== "" && !writes.some((w) => covers(w, inner))) {
      return { block: true, message: `${inner} is not in task ${task}'s Writes list (${writes.join(", ")}). Write only the task's files, or ask the user to change the task.` };
    }
    return { block: false, message: "" };
  }

  const guarded = config.guardedFolders.some((g) => isInside(inner, g));
  if (guarded && ctx.worktrees.size > 0) {
    return {
      block: true,
      message: `${inner} is in a guarded folder of the main tree, and task worktrees are open (${[...ctx.worktrees].join(", ")}). The main tree is not edited during the parallel phase. Merge or remove the worktrees first.`,
    };
  }
  if (guarded && existsAtHead(root, inner)) {
    const plans = ctx.plans ?? [];
    if (!planAllows(plans, inner)) {
      return {
        block: true,
        message: `${inner} is an existing file, and no active committed change plan lists it under "Existing files to edit". Propose the plan change to the user; it counts once the user commits it.`,
      };
    }
  }
  return { block: false, message: "" };
}

export function protectHook(eventText: string, argv: string[]): { exit: 0 | 1 | 2; stderr: string } {
  let event: { cwd?: unknown; tool_input?: unknown } = {};
  try {
    event = eventText.trim() ? (JSON.parse(eventText) as typeof event) : {};
  } catch {
    return { exit: 1, stderr: "protect hook: could not parse the hook event; allowing the call" };
  }
  const cwd = typeof event.cwd === "string" ? event.cwd : process.cwd();
  const root = existsSync(join(cwd, "conformance.config.json")) ? cwd : process.cwd();
  let config: Config;
  try {
    config = loadConfig(root);
  } catch (e) {
    return { exit: 1, stderr: `protect hook: ${e instanceof Error ? e.message : String(e)}; allowing the call` };
  }

  const raw = argv.includes("--shell")
    ? shellWriteTargets(String((event.tool_input as { command?: unknown } | undefined)?.command ?? ""))
    : pathsFromInput(event.tool_input);
  const targets = [...new Set(raw.map((p) => toRepo(root, cwd, p)).filter((p): p is string => p !== null))];
  if (targets.length === 0) return { exit: 0, stderr: "" };

  const hasGit = existsSync(join(root, ".git"));
  const ctx = {
    worktrees: hasGit ? openTaskWorktrees(root) : new Set<string>(),
    unlocked: unlocked(root, config),
    plans: hasGit ? activePlans(root, config.specsFolder) : null,
  };
  const blocked = targets.map((t) => decide(root, config, t, ctx)).filter((d) => d.block);
  if (blocked.length === 0) return { exit: 0, stderr: "" };
  return { exit: 2, stderr: `Blocked by the protection hook:\n${blocked.map((b) => `- ${b.message}`).join("\n")}` };
}

if (import.meta.main) {
  let input = "";
  try {
    input = readFileSync(0, "utf8");
  } catch {
    input = "";
  }
  try {
    const r = protectHook(input, process.argv.slice(2));
    if (r.stderr) process.stderr.write(r.stderr + "\n");
    process.exit(r.exit);
  } catch (e) {
    process.stderr.write(`protect hook failed: ${e instanceof Error ? e.message : String(e)}; allowing the call\n`);
    process.exit(1);
  }
}
