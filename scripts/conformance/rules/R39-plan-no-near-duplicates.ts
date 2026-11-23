import { buildCatalog } from "../catalog.ts";
import { workingPlans } from "../plans.ts";
import { nearDuplicateKey } from "./R08-near-duplicate-names.ts";
import { violation, type Rule, type Violation } from "../types.ts";

export const R39: Rule = {
  id: "R39",
  name: "plan-no-near-duplicates",
  severity: "error",
  needs: ["specs"],
  scope: "project",
  check(ctx) {
    const verbs = ctx.config.nearDuplicateVerbs;
    const existing = buildCatalog(ctx).steps.map((s) => s.name);
    const out: Violation[] = [];
    for (const p of workingPlans(ctx.root, ctx.config.specsFolder)) {
      if (p.status === "done") continue;
      const seen: string[] = [...existing];
      for (const s of p.steps) {
        if (s.action !== "new") {
          seen.push(s.step);
          continue;
        }
        const key = nearDuplicateKey(s.step, verbs);
        const twin = seen.find((n) => n !== s.step && nearDuplicateKey(n, verbs) === key);
        if (twin && s.distinctFrom.trim() === "") {
          out.push(violation(R39, p.path, s.line, `new step "${s.step}" is a near-duplicate of "${twin}". Reuse it, rename, or add a "Distinct from" note saying why both are needed`, s.step));
        }
        seen.push(s.step);
      }
    }
    return out;
  },
};
