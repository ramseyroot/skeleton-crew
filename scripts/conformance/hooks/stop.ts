// Kiro Stop hook: run the check command before the agent finishes, and send it back while checks fail.
// Usage (hook command): node scripts/conformance/hooks/stop.ts
//        (prompt-submit hook, resets the attempt counter): node scripts/conformance/hooks/stop.ts --reset
//
// Exit codes, per Kiro's Stop hook contract:
//   0 with {"decision":"block","reason":...} on stdout: the agent takes another turn with the reason.
//   0 with no output: the agent may stop.
//   3 (any code other than 0 and 1): the turn ends and output is not forwarded. Used when this hook
//     itself fails, so a broken hook can never trap the agent in a loop.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runChecks } from "../check.ts";
import { loadConfig, type Config } from "../config.ts";
import { treeFingerprint } from "../git.ts";

type Session = { blocks: number };
type StopState = { sessions: Record<string, Session>; lastPass: string | null };

function readStdin(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function findRoot(cwd: string): string {
  return existsSync(join(cwd, "conformance.config.json")) ? cwd : process.cwd();
}

function statePath(root: string, c: Config): string {
  return join(root, c.output.reportDir, "stop-state.json");
}

function load(root: string, c: Config): StopState {
  try {
    const s = JSON.parse(readFileSync(statePath(root, c), "utf8")) as StopState;
    return { sessions: s.sessions ?? {}, lastPass: s.lastPass ?? null };
  } catch {
    return { sessions: {}, lastPass: null };
  }
}

function save(root: string, c: Config, s: StopState): void {
  mkdirSync(join(root, c.output.reportDir), { recursive: true });
  writeFileSync(statePath(root, c), JSON.stringify(s, null, 2) + "\n");
}

const fingerprintFolders = (c: Config): string[] => [...c.sourceRoots, c.specsFolder, "docs", "scripts", ".kiro"];

export type StopOutcome = { exit: 0 | 3; stdout: string };

export function stopHook(eventText: string, argv: string[]): StopOutcome {
  let event: { session_id?: unknown; cwd?: unknown } = {};
  try {
    event = eventText.trim() ? (JSON.parse(eventText) as typeof event) : {};
  } catch {
    event = {};
  }
  const root = resolve(findRoot(typeof event.cwd === "string" ? event.cwd : process.cwd()));
  const session = typeof event.session_id === "string" && event.session_id !== "" ? event.session_id : "default";
  const config = loadConfig(root);
  const state = load(root, config);

  if (argv.includes("--reset")) {
    delete state.sessions[session];
    save(root, config, state);
    return { exit: 0, stdout: "" };
  }

  const before = treeFingerprint(root, fingerprintFolders(config));
  if (config.stopHook.skipIfUnchanged && state.lastPass === before) return { exit: 0, stdout: "" };

  const result = runChecks(root);
  if (result.exitCode === 0) {
    delete state.sessions[session];
    state.lastPass = treeFingerprint(root, fingerprintFolders(config));
    save(root, config, state);
    return { exit: 0, stdout: "" };
  }

  const s = state.sessions[session] ?? { blocks: 0 };
  s.blocks += 1;
  state.sessions[session] = s;
  save(root, config, state);
  const limit = config.stopHook.maxConsecutiveBlocks;
  const report = `${config.output.reportDir}/report.md`;
  if (s.blocks < limit) {
    const reason = `The checks failed (attempt ${s.blocks} of ${limit}). Fix every item below before finishing. Do not edit protected files or add exceptions to get around a rule; ask the user instead.\n\n${result.output}`;
    return { exit: 0, stdout: JSON.stringify({ decision: "block", reason }) };
  }
  if (s.blocks === limit) {
    const reason = `The checks still fail after ${limit} attempts. Stop fixing now. Tell the user which items remain (listed in ${report}) and what decision you need from them. Do not edit protected files or add exceptions to get around this.\n\n${result.output}`;
    return { exit: 0, stdout: JSON.stringify({ decision: "block", reason }) };
  }
  return { exit: 0, stdout: "" }; // over the limit: let the agent stop and wait for the user
}

if (import.meta.main) {
  const input = readStdin();
  try {
    const out = stopHook(input, process.argv.slice(2));
    if (out.stdout) process.stdout.write(out.stdout + "\n");
    process.exit(out.exit);
  } catch (e) {
    try {
      const dir = join(process.cwd(), ".conformance");
      mkdirSync(dir, { recursive: true });
      appendFileSync(join(dir, "stop-error.log"), `${new Date().toISOString()} ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
    } catch {
      // nothing more can be done; exit code 3 still ends the turn without a loop
    }
    process.exit(3);
  }
}
