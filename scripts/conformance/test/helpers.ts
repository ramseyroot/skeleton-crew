// Test helpers: temporary projects and simple fake rules.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CONFIG_FILE } from "../config.ts";
import { violation, type Context, type Need, type Rule, type Severity, type Violation } from "../types.ts";

export const repoRoot = new URL("../../../", import.meta.url).pathname.replace(/\/$/, "");

export function repoConfig(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(repoRoot, CONFIG_FILE), "utf8"));
}

export type Project = { dir: string; write(rel: string, text: string): void; cleanup(): void };

/** Creates a temporary project with the repository's config (optionally changed) and the given files. */
export function makeProject(
  files: Record<string, string>,
  patch?: (config: Record<string, unknown>) => void,
): Project {
  const dir = mkdtempSync(join(tmpdir(), "conformance-"));
  const write = (rel: string, text: string): void => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  };
  const config = repoConfig();
  // A fixture project has no test runner of its own, whatever the real repository configures.
  config.checks = { ...(config.checks as Record<string, unknown>), test: null, testFiles: null };
  patch?.(config);
  write(CONFIG_FILE, JSON.stringify(config, null, 2));
  for (const [rel, text] of Object.entries(files)) write(rel, text);
  return { dir, write, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** A fake rule for runner tests. */
export function fakeRule(
  id: string,
  opts: {
    severity?: Severity;
    needs?: Need[];
    scope?: "file" | "project";
    phase?: "main" | "post";
    check?: (ctx: Context, rule: Rule) => Violation[];
  } = {},
): Rule {
  const rule: Rule = {
    id,
    name: `fake-${id.toLowerCase()}`,
    severity: opts.severity ?? "error",
    needs: opts.needs ?? [],
    scope: opts.scope ?? "file",
    phase: opts.phase ?? "main",
    check: (ctx) => (opts.check ? opts.check(ctx, rule) : []),
  };
  return rule;
}

/** A fake rule that reports one violation per source file. */
export function perFileRule(id: string, severity: Severity = "error", scope: "file" | "project" = "file"): Rule {
  return fakeRule(id, {
    severity,
    scope,
    check: (ctx, rule) => ctx.files.map((f) => violation(rule, f, 1, `found in ${f}`)),
  });
}
