import { buildCatalog, CATALOG_JSON, parseCatalog, type CatalogStep } from "../catalog.ts";
import { showAtHead } from "../git.ts";
import { workingPlans } from "../plans.ts";
import { violation, type Rule, type Violation } from "../types.ts";

const contract = (s: CatalogStep): string => JSON.stringify({ input: s.input, output: s.output, permissions: s.permissions });

export const R32: Rule = {
  id: "R32",
  name: "plan-reuse-matches",
  severity: "error",
  needs: ["git", "specs"],
  scope: "project",
  check(ctx) {
    const plans = workingPlans(ctx.root, ctx.config.specsFolder).filter((p) => p.status !== "done");
    if (plans.every((p) => p.steps.every((s) => s.action !== "reuse"))) return [];
    const head = parseCatalog(showAtHead(ctx.root, CATALOG_JSON));
    const before = new Map((head?.steps ?? []).map((s) => [s.name, s]));
    const now = new Map(buildCatalog(ctx).steps.map((s) => [s.name, s]));
    const out: Violation[] = [];
    for (const p of plans) {
      for (const s of p.steps) {
        if (s.action !== "reuse") continue;
        const old = before.get(s.step);
        if (!old) {
          out.push(violation(R32, p.path, s.line, `reuse of "${s.step}", but no such step is in the committed catalog. Mark it new, or fix the name`, s.step));
          continue;
        }
        const cur = now.get(s.step);
        if (!cur || contract(cur) !== contract(old)) {
          out.push(violation(R32, p.path, s.line, `reuse of "${s.step}", but its input, output, or permissions now differ from the committed catalog. Reuse means unchanged`, s.step));
        }
      }
    }
    return out;
  },
};
