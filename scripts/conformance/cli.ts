// Conformance script entry point.
// Usage: node scripts/conformance/cli.ts [--files a.ts,b.ts] [--strict] [--json] [--root <dir>]

import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { ConfigError, loadConfig, type Config } from "./config.ts";
import { createProgram, isDir, isGitRepo, listSourceFiles, readRel } from "./project.ts";
import { discoverAdapters, discoverDefinitions, discoverPorts } from "./discover.ts";
import { applyExceptions, loadExceptions } from "./exceptions.ts";
import { exitCode, formatConsole, sortViolations, writeReportFiles, type Report } from "./report.ts";
import { rules as registry } from "./rules/index.ts";
import type { Context, Need, Rule, Violation } from "./types.ts";

export type RunOptions = {
  root: string;
  files?: string[] | null;
  strict?: boolean;
  rules?: Rule[];
  writeReport?: boolean;
};

export type RunResult = { report: Report; exitCode: 0 | 1 | 2; output: string; config: Config | null };

function detectNeeds(root: string, config: Config): Set<Need> {
  const has = new Set<Need>();
  const d = (rel: string): boolean => isDir(join(root, rel));
  if (d(config.folders.steps)) has.add("steps");
  if (d(config.folders.strips)) has.add("strips");
  if (d(config.folders.ports)) has.add("ports");
  if (existsSync(join(root, config.folders.config, "profiles.ts"))) has.add("profiles");
  if (existsSync(join(root, "docs/generated/catalog.json"))) has.add("catalog");
  if (isGitRepo(root)) has.add("git");
  if (d(config.folders.coverage)) has.add("coverage");
  if (d(".kiro/steering")) has.add("steering");
  if (d(config.specsFolder)) has.add("specs");
  return has;
}

function emptyReport(scriptErrors: string[]): Report {
  return { violations: [], scriptErrors, notApplicable: [], exceptions: { raw: [], used: [], unused: [] }, rulesRun: 0 };
}

export function runConformance(opts: RunOptions): RunResult {
  const root = resolve(opts.root);
  const strict = opts.strict ?? false;
  let config: Config;
  try {
    config = loadConfig(root);
  } catch (e) {
    const msg = e instanceof ConfigError ? e.message : `config: ${String(e)}`;
    const report = emptyReport([msg]);
    return { report, exitCode: 2, output: `conformance: SCRIPT FAILED. ${msg}`, config: null };
  }

  const scriptErrors: string[] = [];
  const files = listSourceFiles(root, config.sourceRoots);
  const { program, parseErrors } = createProgram(root, files);
  for (const p of parseErrors) scriptErrors.push(`parse error: ${p}`);
  let steps: Context["steps"] = [];
  let strips: Context["strips"] = [];
  try {
    ({ steps, strips } = discoverDefinitions(root, program, files));
  } catch (e) {
    scriptErrors.push(`discovery failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const ctx: Context = {
    root,
    config,
    files,
    scope: opts.files && opts.files.length > 0 ? new Set(opts.files) : null,
    has: detectNeeds(root, config),
    steps,
    strips,
    ports: discoverPorts(root, config.folders.ports),
    adapters: discoverAdapters(root, config.folders.adapters),
    read: (f) => readRel(root, f),
  };

  const all = [...(opts.rules ?? registry)].sort((a, b) => a.id.localeCompare(b.id));
  const notApplicable: Report["notApplicable"] = [];
  const runnable = (r: Rule): boolean => {
    const missing = r.needs.filter((n) => !ctx.has.has(n));
    if (missing.length > 0) {
      notApplicable.push({ rule: r.id, name: r.name, missing });
      return false;
    }
    return true;
  };
  const runRule = (r: Rule, c: Context): Violation[] => {
    try {
      const vs = r.check(c);
      return r.scope === "file" && c.scope ? vs.filter((v) => c.scope?.has(v.file)) : vs;
    } catch (e) {
      scriptErrors.push(`rule ${r.id} ${r.name} crashed: ${e instanceof Error ? e.message : String(e)}`);
      return [];
    }
  };

  let rulesRun = 0;
  const main: Violation[] = [];
  const post: Rule[] = [];
  for (const r of all) {
    if (!runnable(r)) continue;
    if (r.phase === "post") {
      post.push(r);
      continue;
    }
    rulesRun++;
    main.push(...runRule(r, ctx));
  }

  const ex = loadExceptions(root);
  if (ex.error) scriptErrors.push(ex.error);
  const { kept, result } = applyExceptions(ex.raw, main);
  const postCtx: Context = { ...ctx, exceptions: result };
  for (const r of post) {
    rulesRun++;
    kept.push(...runRule(r, postCtx));
  }

  const report: Report = {
    violations: sortViolations(kept),
    scriptErrors,
    notApplicable,
    exceptions: result,
    rulesRun,
  };
  const reportPath = `${config.output.reportDir}/report.md`;
  if (opts.writeReport ?? true) writeReportFiles(root, config.output.reportDir, report);
  const output = formatConsole(report, config.output.maxChars, config.output.maxPerRule, reportPath);
  return { report, exitCode: exitCode(report, strict), output, config };
}

function parseArgs(argv: string[]): { files: string[] | null; strict: boolean; json: boolean; root: string } {
  const out = { files: null as string[] | null, strict: false, json: false, root: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === "--strict") out.strict = true;
    else if (a === "--json") out.json = true;
    else if (a === "--files") out.files = (argv[++i] ?? "").split(",").filter(Boolean);
    else if (a.startsWith("--files=")) out.files = a.slice(8).split(",").filter(Boolean);
    else if (a === "--root") out.root = argv[++i] ?? out.root;
    else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

if (import.meta.main) {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`conformance: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(2);
  }
  const result = runConformance({ root: args.root, files: args.files, strict: args.strict });
  process.stdout.write(
    (args.json ? JSON.stringify({ exitCode: result.exitCode, ...result.report }, null, 2) : result.output) + "\n",
  );
  process.exit(result.exitCode);
}
