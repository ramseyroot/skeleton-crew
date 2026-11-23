// Parses a spec's progress.md log (requirement 26).

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { git } from "./git.ts";
import { isDir } from "./project.ts";

export type ProgressRow = {
  when: string;
  task: string;
  state: string;
  commit: string;
  files: string;
  next: string;
  line: number;
  raw: string;
};

export function parseProgress(text: string): ProgressRow[] {
  const rows: ProgressRow[] = [];
  let header = true;
  text.split("\n").forEach((raw, i) => {
    if (!raw.startsWith("|")) return;
    const cells = raw.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^:?-{3,}:?$/.test(c))) return;
    if (header) {
      header = false;
      return;
    }
    const [when = "", task = "", state = "", commit = "", files = "", next = ""] = cells;
    rows.push({ when, task, state: state.toLowerCase(), commit, files, next, line: i + 1, raw });
  });
  return rows;
}

/** The commit that added a row, for rows whose Commit cell is "this". Null when the row is not committed yet. */
export function commitOfRow(root: string, file: string, raw: string): string | null {
  const r = git(root, ["log", "--format=%h", "-S", raw, "--", file]);
  const ids = r.ok ? r.out.split("\n").filter(Boolean) : [];
  return ids.length > 0 ? (ids[ids.length - 1] as string) : null;
}

/**
 * Repo paths mentioned in a Files cell. Only tokens with a slash whose first folder exists in the
 * repository are checked, so short prose like "rules/R01 to R04" is left alone.
 */
export function pathsInCell(root: string, cell: string): string[] {
  const topDirs = new Set(readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name));
  return cell
    .split(/[\s,()]+/)
    .map((t) => t.replace(/^`|`$|[.;:]$/g, ""))
    .filter((t) => t.includes("/") && !/[{}*?]/.test(t) && topDirs.has(t.split("/")[0] as string));
}

export function pathExists(root: string, rel: string): boolean {
  return existsSync(join(root, rel)) || isDir(join(root, rel));
}
