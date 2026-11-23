import { importsOf, isInside, matchesPackage, parse } from "./_ast.ts";
import { violation, type Rule, type Violation } from "../types.ts";

export const R22: Rule = {
  id: "R22",
  name: "port-domain-types",
  severity: "error",
  needs: ["ports"],
  scope: "file",
  check(ctx) {
    const out: Violation[] = [];
    for (const file of ctx.files) {
      if (!isInside(file, ctx.config.folders.ports)) continue;
      const sf = parse(ctx, file);
      if (!sf) continue;
      for (const imp of importsOf(sf)) {
        if (matchesPackage(imp.spec, ctx.config.providerPackages)) {
          out.push(violation(R22, file, imp.line, `port imports provider package "${imp.spec}". Port signatures use domain types only`));
        }
      }
    }
    return out;
  },
};
