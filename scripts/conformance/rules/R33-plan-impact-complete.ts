import { CATALOG_JSON, parseCatalog } from "../catalog.ts";
import { showAtHead } from "../git.ts";
import { stripTestFile, workingPlans } from "../plans.ts";
import { violation, type Rule, type Violation } from "../types.ts";

export const R33: Rule = {
  id: "R33",
  name: "plan-impact-complete",
  severity: "error",
  needs: ["git", "specs"],
  scope: "project",
  check(ctx) {
    const plans = workingPlans(ctx.root, ctx.config.specsFolder).filter((p) => p.status !== "done");
    if (plans.every((p) => p.steps.every((s) => s.action !== "modify"))) return [];
    const head = parseCatalog(showAtHead(ctx.root, CATALOG_JSON));
    const steps = new Map((head?.steps ?? []).map((s) => [s.name, s]));
    const strips = new Map((head?.strips ?? []).map((s) => [s.name, s]));
    const out: Violation[] = [];
    for (const p of plans) {
      for (const s of p.steps) {
        if (s.action !== "modify") continue;
        const entry = steps.get(s.step);
        if (!entry) {
          out.push(violation(R33, p.path, s.line, `modify of "${s.step}", but no such step is in the committed catalog`, s.step));
          continue;
        }
        const problems: string[] = [];
        const want = [...entry.usedBy].sort();
        const have = [...new Set(s.affected)].sort();
        const missing = want.filter((x) => !have.includes(x));
        const extra = have.filter((x) => !want.includes(x));
        if (missing.length > 0) problems.push(`affected strips leave out ${missing.join(", ")}`);
        if (extra.length > 0) problems.push(`affected strips list ${extra.join(", ")}, which do not use it`);
        const tests = want.map((n) => strips.get(n)).filter((x) => x !== undefined).map((x) => stripTestFile(x.file));
        const untested = tests.filter((t) => !p.affectedTests.includes(t));
        if (untested.length > 0) problems.push(`affected strip tests leave out ${untested.join(", ")}`);
        if (problems.length > 0) out.push(violation(R33, p.path, s.line, `modify of "${s.step}": ${problems.join("; ")} (catalog "used by": ${want.join(", ") || "none"})`, s.step));
      }
    }
    return out;
  },
};
