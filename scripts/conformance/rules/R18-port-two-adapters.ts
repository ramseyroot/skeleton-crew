import { violation, type Rule, type Violation } from "../types.ts";

export const R18: Rule = {
  id: "R18",
  name: "port-two-adapters",
  severity: "error",
  needs: ["ports"],
  scope: "project",
  check(ctx) {
    const out: Violation[] = [];
    for (const port of ctx.ports) {
      const providers = ctx.adapters.filter((a) => a.port === port.name).map((a) => a.provider);
      if (providers.length < 2) {
        const have = providers.length === 0 ? "none" : providers.join(", ");
        out.push(violation(R18, port.file, 0, `port "${port.name}" has ${providers.length} adapter(s) (${have}) in ${ctx.config.folders.adapters}/${port.name}/. Every port needs a real adapter and an in-memory one`));
      }
    }
    return out;
  },
};
