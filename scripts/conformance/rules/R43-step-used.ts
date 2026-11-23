import { featureOf } from "../layout.ts";
import { isTestFile } from "./_ast.ts";
import { violation, type Rule, type Violation } from "../types.ts";

export const R43: Rule = {
  id: "R43",
  name: "step-used",
  severity: "warning",
  needs: ["steps"],
  scope: "project",
  check(ctx) {
    const used = new Set<string>();
    const fallbackNames = new Set<string>();
    for (const strip of ctx.strips) {
      for (const ref of strip.stepRefs) if (ref.step?.name) used.add(ref.step.name);
      const fb = strip.props.fallbacks;
      if (fb && fb.kind === "identifiers") for (const id of fb.value) fallbackNames.add(id);
    }
    const out: Violation[] = [];
    for (const s of ctx.steps) {
      if (s.name === null || isTestFile(s.file)) continue;
      if (used.has(s.name)) continue;
      if (s.exportName !== null && fallbackNames.has(s.exportName)) continue;
      const where = featureOf(s.file, ctx.config.folders) ?? "outside the features folder";
      out.push(violation(R43, s.file, s.line, `step "${s.name}" (${where}) is listed in no strip. Use it, or delete it`, s.name));
    }
    return out;
  },
};
