import { violation, type Rule, type Violation } from "../types.ts";

export const R19: Rule = {
  id: "R19",
  name: "port-contract-test",
  severity: "error",
  needs: ["ports"],
  scope: "project",
  check(ctx) {
    const out: Violation[] = [];
    for (const port of ctx.ports) {
      const file = `${ctx.config.folders.adapters}/${port.name}/contract.test.ts`;
      if (ctx.read(file) === null) {
        out.push(violation(R19, port.file, 0, `port "${port.name}" has no shared contract suite at ${file}`));
      }
    }
    return out;
  },
};
