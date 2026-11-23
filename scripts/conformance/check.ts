// The check command: conformance, type check, tests, and the tests of strips affected by active change plans.
// Usage: node scripts/conformance/check.ts [--root <dir>]
// Every configured check runs even when an earlier one fails, so all problems show at once.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { runConformance } from "./cli.ts";
import { isGitRepo } from "./files.ts";
import { activePlans } from "./plans.ts";

export type StepStatus = "passed" | "failed" | "not configured" | "skipped";
export type CheckStep = { name: string; status: StepStatus; output: string; ms: number; note?: string };
export type CheckResult = { steps: CheckStep[]; exitCode: 0 | 1 | 2; output: string };

function run(root: string, command: string): { ok: boolean; output: string; ms: number } {
  const start = Date.now();
  // Like package scripts: local binaries first, without paying for a package-manager start-up.
  const env = { ...process.env, PATH: `${join(root, "node_modules", ".bin")}${delimiter}${process.env.PATH ?? ""}`, FORCE_COLOR: "0" };
  const r = spawnSync(command, { cwd: root, shell: true, encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, output: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim(), ms: Date.now() - start };
}

const quote = (f: string): string => `'${f.replace(/'/g, `'\\''`)}'`;

/** Keeps the end of long tool output, where test runners and compilers print their summaries. */
function tail(text: string, max: number): string {
  if (text.length <= max) return text;
  return `...\n${text.slice(text.length - Math.max(0, max - 4))}`;
}

export function runChecks(rootArg: string): CheckResult {
  const root = resolve(rootArg);
  const steps: CheckStep[] = [];

  const t0 = Date.now();
  const conf = runConformance({ root });
  steps.push({ name: "conformance", status: conf.exitCode === 0 ? "passed" : "failed", output: conf.output, ms: Date.now() - t0 });
  const config = conf.config;
  if (!config) {
    return { steps, exitCode: 2, output: conf.output };
  }

  const tc = config.checks.typecheck;
  if (tc === null || !existsSync(join(root, "tsconfig.json"))) {
    steps.push({ name: "typecheck", status: "not configured", output: "", ms: 0, note: tc === null ? "checks.typecheck is null" : "no tsconfig.json" });
  } else {
    const r = run(root, tc);
    steps.push({ name: "typecheck", status: r.ok ? "passed" : "failed", output: r.output, ms: r.ms });
  }

  if (config.checks.test === null) {
    steps.push({ name: "tests", status: "not configured", output: "", ms: 0, note: "checks.test is null" });
  } else {
    const r = run(root, config.checks.test);
    steps.push({ name: "tests", status: r.ok ? "passed" : "failed", output: r.output, ms: r.ms });
  }

  const affected = isGitRepo(root)
    ? [...new Set(activePlans(root, config.specsFolder).flatMap((p) => p.affectedTests))].sort()
    : [];
  if (affected.length === 0) {
    steps.push({ name: "affected strip tests", status: "skipped", output: "", ms: 0, note: "no active plan lists affected tests" });
  } else if (config.checks.testFiles === null) {
    // A planned safety check must not be skipped silently: missing configuration fails the run.
    steps.push({
      name: "affected strip tests",
      status: "failed",
      output: `Active change plans list ${affected.length} affected test file(s), but checks.testFiles is not configured, so they cannot run: ${affected.join(", ")}`,
      ms: 0,
      note: "not configured",
    });
  } else {
    const missing = affected.filter((f) => !existsSync(join(root, f)));
    const r = run(root, config.checks.testFiles.replace("{files}", affected.map(quote).join(" ")));
    const ok = r.ok && missing.length === 0;
    const extra = missing.length > 0 ? `\nListed affected test files that do not exist: ${missing.join(", ")}` : "";
    steps.push({ name: "affected strip tests", status: ok ? "passed" : "failed", output: r.output + extra, ms: r.ms });
  }

  const failed = steps.filter((s) => s.status === "failed");
  const exitCode: 0 | 1 | 2 = conf.exitCode === 2 ? 2 : failed.length > 0 ? 1 : 0;

  // Summary lines first, then failure output, within the configured character limit.
  const max = config.output.maxChars;
  const mark = (s: CheckStep): string => (s.status === "passed" ? "ok" : s.status === "failed" ? "FAILED" : s.status);
  const summary = [
    `check: ${exitCode === 0 ? "PASSED" : "FAILED"}`,
    ...steps.map((s) => `  ${s.name}: ${mark(s)}${s.ms > 0 ? ` (${(s.ms / 1000).toFixed(1)}s)` : ""}${s.note ? ` - ${s.note}` : ""}`),
  ].join("\n");
  const notConfigured = steps.filter((s) => s.status === "not configured").map((s) => s.name);
  const ncLine = notConfigured.length > 0 ? `\nNot configured, so not checked (this is not a pass): ${notConfigured.join(", ")}` : "";
  let budget = max - summary.length - ncLine.length;
  const blocks: string[] = [];
  for (const s of failed) {
    if (budget <= 80) break;
    const share = Math.floor(budget / Math.max(1, failed.length - blocks.length));
    const body = s.name === "conformance" ? s.output.slice(0, share - 20) : tail(s.output, share - 20);
    const block = `\n--- ${s.name} ---\n${body}`;
    blocks.push(block);
    budget -= block.length;
  }
  const output = (summary + ncLine + blocks.join("")).slice(0, max);
  return { steps, exitCode, output };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--root");
  const root = i >= 0 ? (args[i + 1] ?? process.cwd()) : process.cwd();
  const unknown = args.filter((a, j) => a !== "--root" && args[j - 1] !== "--root");
  if (unknown.length > 0) {
    process.stderr.write(`check: unknown argument: ${unknown[0]}\n`);
    process.exit(2);
  }
  const result = runChecks(root);
  process.stdout.write(result.output + "\n");
  process.exit(result.exitCode);
}
