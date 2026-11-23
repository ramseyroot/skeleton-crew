import { permissionLists } from "./R13-strip-budget.ts";
import { violation, type Rule, type Violation } from "../types.ts";

export const R14: Rule = {
  id: "R14",
  name: "strip-invalidates",
  severity: "error",
  needs: ["strips"],
  scope: "file",
  check(ctx) {
    const out: Violation[] = [];
    for (const s of ctx.strips) {
      if (s.props.invalidates) continue;
      const writers = s.stepRefs
        .filter((r) => (permissionLists(r.step?.props.permissions)?.writes.length ?? 0) > 0)
        .map((r) => r.step?.name ?? r.text);
      if (writers.length > 0) {
        const label = s.name ?? s.exportName ?? "(unnamed)";
        out.push(violation(R14, s.file, s.line, `strip "${label}" has writing steps (${writers.join(", ")}) but no invalidates list. Write invalidates: [] if no cache keys are affected`, s.name ?? undefined));
      }
    }
    return out;
  },
};
