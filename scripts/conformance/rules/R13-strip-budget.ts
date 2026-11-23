import { matchGlob } from "../project.ts";
import { violation, type Rule, type Value, type Violation } from "../types.ts";

const CATEGORIES = ["reads", "writes", "storage"] as const;

/** Permission lists from a literal permissions or budget object. Missing categories are empty. Null when not literal. */
export function permissionLists(v: Value | undefined): Record<(typeof CATEGORIES)[number], string[]> | null {
  if (!v || v.kind !== "object") return null;
  const out = { reads: [] as string[], writes: [] as string[], storage: [] as string[] };
  for (const c of CATEGORIES) {
    const inner = v.props[c];
    if (!inner) continue;
    if (inner.kind !== "strings") return null;
    out[c] = inner.value;
  }
  return out;
}

const covers = (category: string, budget: string[], need: string): boolean =>
  budget.includes(need) || (category === "storage" && budget.some((b) => matchGlob(need, b)));

export const R13: Rule = {
  id: "R13",
  name: "strip-budget",
  severity: "error",
  needs: ["strips"],
  scope: "file",
  check(ctx) {
    const out: Violation[] = [];
    for (const s of ctx.strips) {
      const label = s.name ?? s.exportName ?? "(unnamed)";
      const target = s.name ?? undefined;
      if (!s.props.budget) {
        if (s.stepRefs.length > 0) out.push(violation(R13, s.file, s.line, `strip "${label}" has no permission budget`, target));
        continue;
      }
      const budget = permissionLists(s.props.budget);
      if (!budget) continue; // non-literal budget is R11
      for (const ref of s.stepRefs) {
        if (!ref.step) {
          out.push(violation(R13, s.file, ref.line, `strip "${label}": step ${ref.text} is not resolved to a defineStep() declaration, so its permissions cannot be checked`, target));
          continue;
        }
        const perms = permissionLists(ref.step.props.permissions);
        if (!perms) continue; // missing or non-literal permissions are R10 and R11
        const excess: string[] = [];
        for (const c of CATEGORIES) {
          for (const need of perms[c]) if (!covers(c, budget[c], need)) excess.push(`${c}: ${need}`);
        }
        if (excess.length > 0) {
          out.push(violation(R13, s.file, ref.line, `strip "${label}": step "${ref.step.name ?? ref.text}" needs ${excess.join(", ")}, which the strip budget does not allow`, target));
        }
      }
    }
    return out;
  },
};
