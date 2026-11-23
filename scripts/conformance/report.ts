// Sorting, the capped console summary, report files, and exit codes.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PlanSummary } from "./plans.ts";
import type { ExceptionResult, Violation } from "./types.ts";

export type Report = {
  violations: Violation[]; // sorted, exceptions removed
  scriptErrors: string[]; // rule crashes, parse failures, bad exceptions file
  notApplicable: Array<{ rule: string; name: string; missing: string[] }>;
  exceptions: ExceptionResult;
  rulesRun: number;
  /** Active committed change plans, when the project has git and specs. */
  plans?: PlanSummary[];
};

export function sortViolations(vs: Violation[]): Violation[] {
  return [...vs].sort(
    (a, b) =>
      a.rule.localeCompare(b.rule) ||
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.message.localeCompare(b.message),
  );
}

export function counts(r: Report): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const v of r.violations) {
    if (v.severity === "error") errors++;
    else warnings++;
  }
  return { errors, warnings };
}

/** 2 when the script itself failed, 1 on errors (or warnings with strict), else 0. */
export function exitCode(r: Report, strict: boolean): 0 | 1 | 2 {
  if (r.scriptErrors.length > 0) return 2;
  const c = counts(r);
  if (c.errors > 0) return 1;
  if (strict && c.warnings > 0) return 1;
  return 0;
}

function groups(vs: Violation[]): Array<{ key: string; items: Violation[] }> {
  const map = new Map<string, Violation[]>();
  for (const v of vs) {
    const key = `${v.rule} ${v.name} (${v.severity})`;
    const list = map.get(key);
    if (list) list.push(v);
    else map.set(key, [v]);
  }
  return [...map].map(([key, items]) => ({ key, items }));
}

const loc = (v: Violation): string => (v.line > 0 ? `${v.file}:${v.line}` : v.file);

const DOCS_SUFFIX = / \(see (docs\/conformance-rules\.md#[a-z0-9-]+)\)$/;

/** Console lines carry the docs pointer once per rule, not on every violation. */
function short(message: string, maxLen: number): string {
  const m = message.replace(DOCS_SUFFIX, "");
  return m.length <= maxLen ? m : `${m.slice(0, maxLen - 3)}...`;
}

function render(r: Report, perRule: number, reportPath: string, truncated: boolean, maxLen = 400): string {
  const c = counts(r);
  const lines: string[] = [];
  const status = r.scriptErrors.length > 0 ? "SCRIPT FAILED" : c.errors > 0 ? "FAILED" : "PASSED";
  lines.push(
    `conformance: ${status}. ${c.errors} error(s), ${c.warnings} warning(s), ${r.rulesRun} rule(s) run, ` +
      `${r.notApplicable.length} not applicable, ${r.exceptions.used.length} exception(s) in use.`,
  );
  for (const e of r.scriptErrors.slice(0, Math.max(perRule, 1))) lines.push(`  script error: ${e}`);
  if (r.scriptErrors.length > Math.max(perRule, 1)) lines.push(`  ... ${r.scriptErrors.length - Math.max(perRule, 1)} more script error(s)`);
  for (const g of groups(r.violations)) {
    const docs = DOCS_SUFFIX.exec(g.items[0]?.message ?? "")?.[1];
    lines.push(`${g.key}: ${g.items.length}${docs ? ` (see ${docs})` : ""}`);
    for (const v of g.items.slice(0, perRule)) lines.push(`  ${loc(v)} ${short(v.message, maxLen)}`);
    if (g.items.length > perRule) lines.push(`  ... ${g.items.length - perRule} more`);
  }
  if (r.notApplicable.length > 0) {
    lines.push(`not applicable: ${r.notApplicable.map((n) => n.rule).join(", ")} (missing parts listed in the full report)`);
  }
  if (truncated || r.violations.length > 0 || r.scriptErrors.length > 0) lines.push(`Full report: ${reportPath}`);
  return lines.join("\n");
}

/**
 * Console summary within maxChars. Shortens per-rule lists down to one violation each, then shortens
 * messages, then drops the lists, and hard-cuts only as a last resort.
 */
export function formatConsole(r: Report, maxChars: number, maxPerRule: number, reportPath: string): string {
  for (let per = maxPerRule; per >= 1; per--) {
    const text = render(r, per, reportPath, per < maxPerRule);
    if (text.length <= maxChars) return text;
  }
  for (const len of [160, 100, 60]) {
    const text = render(r, 1, reportPath, true, len);
    if (text.length <= maxChars) return text;
  }
  {
    const text = render(r, 0, reportPath, true);
    if (text.length <= maxChars) return text;
  }
  const tail = `\n... output cut. Full report: ${reportPath}`;
  return render(r, 0, reportPath, true).slice(0, Math.max(0, maxChars - tail.length)) + tail;
}

export function formatMarkdown(r: Report): string {
  const c = counts(r);
  const out: string[] = ["# Conformance report", ""];
  out.push(`Errors: ${c.errors}. Warnings: ${c.warnings}. Rules run: ${r.rulesRun}.`, "");
  if (r.scriptErrors.length > 0) {
    out.push("## Script errors", "");
    for (const e of r.scriptErrors) out.push(`- ${e}`);
    out.push("");
  }
  for (const g of groups(r.violations)) {
    out.push(`## ${g.key}: ${g.items.length}`, "");
    for (const v of g.items) out.push(`- \`${loc(v)}\` ${v.message}`);
    out.push("");
  }
  out.push("## Not applicable", "");
  if (r.notApplicable.length === 0) out.push("None.");
  for (const n of r.notApplicable) out.push(`- ${n.rule} ${n.name}: missing ${n.missing.join(", ")}`);
  if (r.plans && r.plans.length > 0) {
    out.push("", "## Active change plans", "");
    for (const p of r.plans) {
      out.push(`### ${p.path}`, "");
      out.push(`- Planned files changed: ${p.changed.join(", ") || "none"}`);
      out.push(`- Planned files not changed yet: ${p.plannedUnchanged.join(", ") || "none"}`);
      out.push(`- Affected strip tests: ${p.affectedTests.join(", ") || "none"}`);
      out.push(`- Plan commits: ${p.commits.map((c) => `${c.id} ${c.date} ${c.author}: ${c.subject}`).join("; ") || "none"}`, "");
    }
  }
  out.push("", `## Exceptions in use: ${r.exceptions.used.length}`, "");
  for (const u of r.exceptions.used) {
    out.push(`- ${u.exception.rule} on \`${u.exception.target}\` (${u.exception.date}): ${u.exception.reason}. Covers ${u.violations.length} violation(s).`);
  }
  return out.join("\n") + "\n";
}

export function writeReportFiles(root: string, dir: string, r: Report): { md: string; json: string } {
  mkdirSync(join(root, dir), { recursive: true });
  const md = `${dir}/report.md`;
  const json = `${dir}/report.json`;
  writeFileSync(join(root, md), formatMarkdown(r));
  writeFileSync(join(root, json), JSON.stringify({ ...r, counts: counts(r) }, null, 2) + "\n");
  return { md, json };
}
