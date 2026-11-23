import { dirname } from "node:path";
import type { Config } from "../config.ts";
import { sharedStepFile } from "../layout.ts";
import { workingPlans } from "../plans.ts";
import { parseTasks, covers } from "../tasks.ts";
import { violation, type Rule, type Violation } from "../types.ts";

/** True when a task's Writes entry covers the strip file of `strip` in the feature the entry points into. */
function writesStrip(entry: string, strip: string, folders: Config["folders"]): boolean {
  const m = new RegExp(`^${folders.features.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/([^/*]+)/`).exec(entry);
  return m !== null && covers(entry, `${folders.features}/${m[1]}/strips/${strip}.strip.ts`);
}

export const R38: Rule = {
  id: "R38",
  name: "plan-shared-new-once",
  severity: "error",
  needs: ["specs"],
  scope: "project",
  check(ctx) {
    const folders = ctx.config.folders;
    const out: Violation[] = [];
    for (const p of workingPlans(ctx.root, ctx.config.specsFolder)) {
      if (p.status === "done") continue;
      const tasks = parseTasks(ctx.read(`${dirname(p.path)}/tasks.md`) ?? "").filter((t) => t.writes !== null);
      for (const s of p.steps) {
        if (s.action !== "new" || s.usedBy.length < 2) continue;
        const file = sharedStepFile(s.step, folders);
        const makers = tasks.filter((t) => (t.writes ?? []).some((w) => covers(w, file)));
        const problems: string[] = [];
        if (makers.length === 0) problems.push(`no task writes ${file}`);
        if (makers.length > 1) problems.push(`it is written by ${makers.length} tasks (${makers.map((t) => t.id).join(", ")}), not one`);
        const maker = makers[0];
        if (maker && makers.length === 1) {
          if (!maker.sequential) problems.push(`task ${maker.id}, which creates it, is not sequential`);
          const users = tasks.filter(
            (t) => t !== maker && s.usedBy.some((strip) => (t.writes ?? []).some((w) => writesStrip(w, strip, folders))),
          );
          const early = users.filter((t) => t.order < maker.order);
          if (early.length > 0) problems.push(`tasks ${early.map((t) => t.id).join(", ")} for its strips come before task ${maker.id}`);
        }
        if (problems.length > 0) {
          out.push(violation(R38, p.path, s.line, `new step "${s.step}" is used by ${s.usedBy.join(", ")}, so it must be created once, by one sequential task before theirs: ${problems.join("; ")}`, s.step));
        }
      }
    }
    return out;
  },
};
