import { eachNode, isInside, lineOf, parse, ts } from "./_ast.ts";
import { violation, type Rule, type Violation } from "../types.ts";

export const R01: Rule = {
  id: "R01",
  name: "no-console",
  severity: "error",
  needs: [],
  scope: "file",
  check(ctx) {
    const out: Violation[] = [];
    for (const file of ctx.files) {
      if (isInside(file, ctx.config.folders.loggerAdapter)) continue;
      const sf = parse(ctx, file);
      if (!sf) continue;
      const seen = new Set<number>();
      eachNode(sf, (n) => {
        if (!ts.isIdentifier(n) || n.text !== "console") return;
        const p = n.parent;
        // Skip `x.console` (a property name) and declarations named console.
        if (ts.isPropertyAccessExpression(p) && p.name === n) return;
        if ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isPropertyAssignment(p)) && p.name === n) return;
        const line = lineOf(sf, n);
        if (seen.has(line)) return;
        seen.add(line);
        const what = ts.isPropertyAccessExpression(p) && p.expression === n ? `console.${p.name.text}` : "console";
        out.push(violation(R01, file, line, `${what} used outside the logger adapter (${ctx.config.folders.loggerAdapter}). Use the Logger port`));
      });
    }
    return out;
  },
};
