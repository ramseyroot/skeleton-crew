// Parses change plans (.kiro/specs/<name>/change-plan.md) and summarizes active ones.
// Permissions come only from the version committed at HEAD (requirement 16.7).

import { changedFiles, filesAtHead, git, showAtHead } from "./git.ts";
import { isInside, matchGlob, readRel, walk } from "./project.ts";

export type PlanStep = {
  step: string;
  action: string;
  usedBy: string[];
  affected: string[];
  reason: string;
  distinctFrom: string;
  line: number;
};

export type PlanFile = { file: string; task: string; reason: string; line: number };

export type Plan = {
  path: string;
  status: string | null;
  created: string | null;
  updated: string | null;
  strips: string[];
  steps: PlanStep[];
  files: PlanFile[];
  affectedTests: string[];
};

const splitList = (s: string): string[] =>
  s
    .split(",")
    .map((x) => x.trim().replace(/^`|`$/g, ""))
    .filter((x) => x !== "" && x !== "-");

function frontMatter(text: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  const out: Record<string, string> = {};
  if (!m) return out;
  for (const line of (m[1] as string).split("\n")) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*?)\s*(#.*)?$/.exec(line);
    if (kv) out[kv[1] as string] = (kv[2] as string).trim();
  }
  return out;
}

type Table = { headers: string[]; rows: Array<{ cells: string[]; line: number }> };

/** Splits a markdown document into sections by "## " heading, and reads the first table and bullet list of each. */
function sections(text: string): Map<string, { table: Table | null; bullets: string[] }> {
  const lines = text.split("\n");
  const out = new Map<string, { table: Table | null; bullets: string[] }>();
  let cur: { table: Table | null; bullets: string[] } | null = null;
  lines.forEach((raw, i) => {
    const h = /^##\s+(.+?)\s*$/.exec(raw);
    if (h) {
      cur = { table: null, bullets: [] };
      out.set((h[1] as string).toLowerCase(), cur);
      return;
    }
    if (!cur) return;
    const c = cur as { table: Table | null; bullets: string[] };
    if (raw.startsWith("|")) {
      const cells = raw.split("|").slice(1, -1).map((x) => x.trim());
      if (cells.every((x) => /^:?-{3,}:?$/.test(x))) return;
      if (!c.table) c.table = { headers: cells.map((x) => x.toLowerCase()), rows: [] };
      else c.table.rows.push({ cells, line: i + 1 });
    } else if (/^\s*-\s+/.test(raw)) {
      c.bullets.push(raw.replace(/^\s*-\s+/, "").trim().replace(/^`|`$/g, ""));
    }
  });
  return out;
}

function cell(t: Table, row: { cells: string[] }, ...names: string[]): string {
  for (const n of names) {
    const i = t.headers.findIndex((h) => h.startsWith(n));
    if (i >= 0) return (row.cells[i] ?? "").trim();
  }
  return "";
}

export function parsePlan(path: string, text: string): Plan {
  const fm = frontMatter(text);
  const sec = sections(text);
  const steps: PlanStep[] = [];
  const st = sec.get("steps")?.table;
  if (st) {
    for (const r of st.rows) {
      const step = cell(st, r, "step").replace(/^`|`$/g, "");
      if (step === "") continue;
      steps.push({
        step,
        action: cell(st, r, "action").toLowerCase(),
        usedBy: splitList(cell(st, r, "used by")),
        affected: splitList(cell(st, r, "affected")),
        reason: cell(st, r, "reason"),
        distinctFrom: cell(st, r, "distinct"),
        line: r.line,
      });
    }
  }
  const files: PlanFile[] = [];
  const ft = sec.get("existing files to edit")?.table;
  if (ft) {
    for (const r of ft.rows) {
      const file = cell(ft, r, "file").replace(/^`|`$/g, "");
      if (file !== "") files.push({ file, task: cell(ft, r, "task"), reason: cell(ft, r, "reason"), line: r.line });
    }
  }
  return {
    path,
    status: fm.status ?? null,
    created: fm.created ?? null,
    updated: fm.updated ?? null,
    strips: sec.get("strips in this spec")?.bullets.filter((b) => !/^none\b/i.test(b)) ?? [],
    steps,
    files,
    affectedTests: sec.get("affected strip tests")?.bullets.filter((b) => !/^none\b/i.test(b)) ?? [],
  };
}

const isPlanPath = (specsFolder: string, p: string): boolean =>
  isInside(p, specsFolder) && /\/[^/]+\/change-plan\.md$/.test(p.slice(specsFolder.length));

/** Plans as they are in the working tree (for checking drafts early). */
export function workingPlans(root: string, specsFolder: string): Plan[] {
  return walk(root, specsFolder, (f) => f.endsWith("/change-plan.md"))
    .filter((p) => isPlanPath(specsFolder, p))
    .map((p) => parsePlan(p, readRel(root, p) ?? ""));
}

/** Plans as committed at HEAD. Only these grant permission. */
export function committedPlans(root: string, specsFolder: string): Plan[] {
  return [...filesAtHead(root)]
    .filter((p) => isPlanPath(specsFolder, p))
    .sort()
    .map((p) => parsePlan(p, showAtHead(root, p) ?? ""));
}

export function activePlans(root: string, specsFolder: string): Plan[] {
  return committedPlans(root, specsFolder).filter((p) => p.status === "active");
}

/** True when a file is listed in a plan (exact path, or a glob entry). */
export function planAllows(plans: Plan[], file: string): boolean {
  return plans.some((p) => p.files.some((f) => f.file === file || matchGlob(file, f.file)));
}

export type PlanSummary = {
  path: string;
  changed: string[];
  plannedUnchanged: string[];
  affectedTests: string[];
  commits: Array<{ id: string; author: string; date: string; subject: string }>;
};

/** Per active plan: which planned files changed, which did not, its affected tests, and who committed the plan. */
export function summarizeActivePlans(root: string, specsFolder: string): PlanSummary[] {
  const changed = new Set(changedFiles(root));
  return activePlans(root, specsFolder).map((p) => {
    const log = git(root, ["log", "--format=%h%x09%an%x09%cs%x09%s", "--", p.path]);
    const commits = (log.ok ? log.out : "")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const [id = "", author = "", date = "", subject = ""] = l.split("\t");
        return { id, author, date, subject };
      });
    const planned = p.files.map((f) => f.file);
    return {
      path: p.path,
      changed: planned.filter((f) => changed.has(f)),
      plannedUnchanged: planned.filter((f) => !changed.has(f)),
      affectedTests: p.affectedTests,
      commits,
    };
  });
}

/** The test file for a strip file, by convention: x.strip.ts gives x.strip.test.ts. */
export function stripTestFile(stripFile: string): string {
  return stripFile.replace(/\.tsx?$/, (ext) => `.test${ext}`);
}
