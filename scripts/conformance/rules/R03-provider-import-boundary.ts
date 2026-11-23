import { importsOf, isInAdapterProvider, isInside, matchesPackage, parse } from "./_ast.ts";
import { violation, type Rule, type Violation } from "../types.ts";

export const R03: Rule = {
  id: "R03",
  name: "provider-import-boundary",
  severity: "error",
  needs: [],
  scope: "file",
  check(ctx) {
    const { adapters, ports } = ctx.config.folders;
    const out: Violation[] = [];
    for (const file of ctx.files) {
      if (isInAdapterProvider(file, adapters)) continue;
      if (isInside(file, ports)) continue; // reported by R22 port-domain-types
      const sf = parse(ctx, file);
      if (!sf) continue;
      for (const imp of importsOf(sf)) {
        const pattern = matchesPackage(imp.spec, ctx.config.providerPackages);
        if (pattern) {
          out.push(violation(R03, file, imp.line, `imports provider package "${imp.spec}" outside ${adapters}/<port>/<provider>/. Call a port instead`));
        }
      }
    }
    return out;
  },
};
