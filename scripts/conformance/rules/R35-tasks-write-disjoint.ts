import { overlaps, taskFiles } from "../tasks.ts";
import { violation, type Rule, type Violation } from "../types.ts";

export const R35: Rule = {
  id: "R35",
  name: "tasks-write-disjoint",
  severity: "error",
  needs: ["specs"],
  scope: "project",
  check(ctx) {
    const out: Violation[] = [];
    for (const tf of taskFiles(ctx.root, ctx.config.specsFolder)) {
      const parallel = tf.tasks.filter((t) => !t.done && !t.sequential && t.writes !== null);
      for (let i = 0; i < parallel.length; i++) {
        const b = parallel[i] as (typeof parallel)[number];
        for (let j = 0; j < i; j++) {
          const a = parallel[j] as (typeof parallel)[number];
          const shared = (b.writes ?? []).filter((wb) => (a.writes ?? []).some((wa) => overlaps(wa, wb)));
          if (shared.length > 0) {
            out.push(violation(R35, tf.path, b.line, `task ${b.id} and task ${a.id} can run in parallel but both write ${shared.join(", ")}. Mark one sequential or split the files`));
          }
        }
      }
    }
    return out;
  },
};
