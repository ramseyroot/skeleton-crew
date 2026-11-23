import { violation, type Rule, type Violation } from "../types.ts";

export const R12: Rule = {
  id: "R12",
  name: "strip-routing-complete",
  severity: "error",
  needs: ["strips"],
  scope: "file",
  check(ctx) {
    const out: Violation[] = [];
    for (const s of ctx.strips) {
      const label = s.name ?? s.exportName ?? "(unnamed)";
      const routing = s.props.routing;
      if (!routing) {
        if (s.stepRefs.length > 0) {
          out.push(violation(R12, s.file, s.line, `strip "${label}" has no routing table. Add an entry per step or a "*" entry`, s.name ?? undefined));
        }
        continue;
      }
      if (routing.kind !== "object" || "*" in routing.props) continue; // non-literal routing is R11
      for (const ref of s.stepRefs) {
        if (!ref.step) {
          out.push(violation(R12, s.file, ref.line, `strip "${label}": step ${ref.text} is not resolved to a defineStep() declaration, so its routing cannot be checked`, s.name ?? undefined));
        } else if (ref.step.name !== null && !(ref.step.name in routing.props)) {
          out.push(violation(R12, s.file, ref.line, `strip "${label}": step "${ref.step.name}" has no routing entry and there is no "*" entry`, s.name ?? undefined));
        }
      }
    }
    return out;
  },
};
