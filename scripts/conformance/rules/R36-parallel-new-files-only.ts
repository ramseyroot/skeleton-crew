import { git } from "../git.ts";
import { covers, taskFiles } from "../tasks.ts";
import { violation, type Rule, type Violation } from "../types.ts";

export const R36: Rule = {
  id: "R36",
  name: "parallel-new-files-only",
  severity: "error",
  needs: ["git", "specs"],
  scope: "project",
  check(ctx) {
    const out: Violation[] = [];
    for (const tf of taskFiles(ctx.root, ctx.config.specsFolder)) {
      // "Existing" means existing when the task list was last committed, so files a task has since
      // created (in its worktree, or after merging) do not count against it.
      const since = git(ctx.root, ["log", "-1", "--format=%H", "--", tf.path]).out.trim() || "HEAD";
      const listed = git(ctx.root, ["ls-tree", "-r", "--name-only", "-z", since]);
      const head = listed.ok ? listed.out.split("\0").filter(Boolean) : [];
      for (const t of tf.tasks) {
        if (t.done || t.sequential || t.writes === null) continue;
        const existing = t.writes.filter((w) => head.some((f) => covers(w, f)));
        if (existing.length > 0) {
          out.push(violation(R36, tf.path, t.line, `task ${t.id} is not sequential but writes existing files: ${existing.join(", ")}. Mark it "Mode: sequential"`));
        }
      }
    }
    return out;
  },
};
