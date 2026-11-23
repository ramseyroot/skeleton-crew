import { violation, type Rule, type Violation } from "../types.ts";

export const R15: Rule = {
  id: "R15",
  name: "strip-routing-unknown-step",
  severity: "error",
  needs: ["strips"],
  scope: "file",
  check(ctx) {
    const out: Violation[] = [];
    for (const s of ctx.strips) {
      const routing = s.props.routing;
      if (!routing || routing.kind !== "object") continue;
      const names = new Set(s.stepRefs.map((r) => r.step?.name).filter((n): n is string => typeof n === "string"));
      for (const [key, v] of Object.entries(routing.props)) {
        if (key === "*" || names.has(key)) continue;
        const label = s.name ?? s.exportName ?? "(unnamed)";
        out.push(violation(R15, s.file, v.line, `strip "${label}": routing entry "${key}" is not a step of this strip`, s.name ?? undefined));
      }
    }
    return out;
  },
};
