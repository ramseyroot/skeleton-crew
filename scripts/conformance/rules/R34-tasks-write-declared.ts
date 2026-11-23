import { taskFiles } from "../tasks.ts";
import { violation, type Rule, type Violation } from "../types.ts";

export const R34: Rule = {
  id: "R34",
  name: "tasks-write-declared",
  severity: "error",
  needs: ["specs"],
  scope: "project",
  check(ctx) {
    const out: Violation[] = [];
    for (const tf of taskFiles(ctx.root, ctx.config.specsFolder)) {
      for (const t of tf.tasks) {
        if (!t.done && t.writes === null) {
          out.push(violation(R34, tf.path, t.line, `task ${t.id} has no "Writes:" line listing the files it writes`));
        }
      }
    }
    return out;
  },
};
