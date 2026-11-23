import { dirname } from "node:path";
import { commitExists } from "../git.ts";
import { parseProgress, pathExists, pathsInCell } from "../progress.ts";
import { walk } from "../project.ts";
import { parseTasks } from "../tasks.ts";
import { violation, type Rule, type Violation } from "../types.ts";

export const R40: Rule = {
  id: "R40",
  name: "progress-consistent",
  severity: "error",
  needs: ["specs", "git"],
  scope: "project",
  check(ctx) {
    const out: Violation[] = [];
    for (const tasksFile of walk(ctx.root, ctx.config.specsFolder, (f) => f.endsWith("/tasks.md"))) {
      const dir = dirname(tasksFile);
      const progressFile = `${dir}/progress.md`;
      const progressText = ctx.read(progressFile);
      const tasks = parseTasks(ctx.read(tasksFile) ?? "");
      if (progressText === null) {
        if (tasks.length > 0) out.push(violation(R40, progressFile, 0, `spec has tasks but no progress.md`));
        continue;
      }
      const rows = parseProgress(progressText);
      const taskIds = new Set(tasks.map((t) => t.id));

      for (const t of tasks) {
        if (t.done && !rows.some((r) => r.task === t.id && r.state === "done")) {
          out.push(violation(R40, tasksFile, t.line, `task ${t.id} is ticked but progress.md has no "done" row for it`));
        }
      }

      for (const r of rows) {
        if (r.state !== "done" || !taskIds.has(r.task)) continue;
        const problems: string[] = [];
        // "this" means the commit that adds the row, so it needs no lookup (see commitOfRow for resolving it).
        if (r.commit !== "this" && (r.commit === "" || !commitExists(ctx.root, r.commit))) {
          problems.push(`commit "${r.commit || "(empty)"}" does not exist`);
        }
        const missing = pathsInCell(ctx.root, r.files).filter((p) => !pathExists(ctx.root, p));
        if (missing.length > 0) problems.push(`listed files do not exist: ${missing.join(", ")}`);
        if (problems.length > 0) out.push(violation(R40, progressFile, r.line, `done row for task ${r.task}: ${problems.join("; ")}`));
      }

      // A task started and left open (no later done or blocked) while another task started after it.
      rows.forEach((r, i) => {
        if (r.state !== "started" || !taskIds.has(r.task)) return;
        const later = rows.slice(i + 1);
        const closed = later.some((x) => x.task === r.task && (x.state === "done" || x.state === "blocked" || x.state === "started"));
        const other = later.some((x) => x.state === "started" && x.task !== r.task && taskIds.has(x.task));
        if (!closed && other) {
          out.push(violation(R40, progressFile, r.line, `task ${r.task} was started and never marked done or blocked, but a later task started`));
        }
      });
    }
    return out;
  },
};
