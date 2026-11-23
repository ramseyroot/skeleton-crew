// Sorting, the capped console summary, report files, and exit codes.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExceptionResult, Violation } from "./types.ts";

export type Report = {
  violations: Violation[]; // sorted, exceptions removed
  scriptErrors: string[]; // rule crashes, parse failures, bad exceptions file
  notApplicable: Array<{ rule: string; name: string; missing: string[] }>;
  exceptions: ExceptionResult;
  rulesRun: number;
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

function render(r: Report, perRule: number, reportPath: string, truncated: boolean): string {
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
    lines.push(`${g.key}: ${g.items.length}`);
    for (const v of g.items.slice(0, perRule)) lines.push(`  ${loc(v)} ${v.message}`);
    if (g.items.length > perRule) lines.push(`  ... ${g.items.length - perRule} more`);
  }
  if (r.notApplicable.length > 0) {
    lines.push(`not applicable: ${r.notApplicable.map((n) => n.rule).join(", ")} (missing parts listed in the full report)`);
  }
  if (truncated || r.violations.length > 0 || r.scriptErrors.length > 0) lines.push(`Full report: ${reportPath}`);
  return lines.join("\n");
}

/** Console summary within maxChars. Shortens per-rule lists, then hard-cuts as a last resort. */
export function formatConsole(r: Report, maxChars: number, maxPerRule: number, reportPath: string): string {
  for (let per = maxPerRule; per >= 0; per--) {
    const text = render(r, per, reportPath, per < maxPerRule);
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
