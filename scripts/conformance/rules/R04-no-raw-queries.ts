import { inStepsLayer, inStripsLayer } from "../layout.ts";
import { eachNode, lineOf, parse, ts } from "./_ast.ts";
import { violation, type Rule, type Violation } from "../types.ts";

// Statement shapes, not single words, so ordinary text such as "select a plan" is not flagged.
const IDENT = '[\\w."`]+';
const SQL = new RegExp(
  `^\\s*(select\\s+(\\*|${IDENT}(\\s*,\\s*${IDENT})*)\\s+from\\s+${IDENT}` +
    `|insert\\s+into\\s|update\\s+${IDENT}\\s+set\\s|delete\\s+from\\s|with\\s+\\w+\\s+as\\s*\\(` +
    `|create\\s+(table|index)\\s|drop\\s+table\\s|alter\\s+table\\s)`,
  "i",
);

function tagName(tag: ts.Expression): string | null {
  if (ts.isIdentifier(tag)) return tag.text;
  if (ts.isPropertyAccessExpression(tag)) return tag.name.text;
  return null;
}

export const R04: Rule = {
  id: "R04",
  name: "no-raw-queries",
  severity: "error",
  needs: [],
  scope: "file",
  check(ctx) {
    const out: Violation[] = [];
    for (const file of ctx.files) {
      if (!inStepsLayer(file, ctx.config.folders) && !inStripsLayer(file, ctx.config.folders)) continue;
      const sf = parse(ctx, file);
      if (!sf) continue;
      const lines = new Set<number>();
      const report = (n: ts.Node, what: string): void => {
        const line = lineOf(sf, n);
        if (lines.has(line)) return;
        lines.add(line);
        out.push(violation(R04, file, line, `${what}. Queries belong in a repository adapter; call a named port method`));
      };
      eachNode(sf, (n) => {
        if (ts.isTaggedTemplateExpression(n) && tagName(n.tag)?.toLowerCase() === "sql") {
          report(n, "sql tagged template");
        } else if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && SQL.test(n.text)) {
          if (!ts.isTaggedTemplateExpression(n.parent)) report(n, "raw SQL string");
        } else if (ts.isTemplateExpression(n) && SQL.test(n.head.text + " x " + n.templateSpans.map((s) => s.literal.text).join(" x "))) {
          if (!ts.isTaggedTemplateExpression(n.parent)) report(n, "raw SQL template");
        }
      });
    }
    return out;
  },
};
