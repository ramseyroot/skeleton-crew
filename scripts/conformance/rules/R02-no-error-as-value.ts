import { inStepsLayer, inStripsLayer } from "../layout.ts";
import { eachNode, isInside, lineOf, parse, ts } from "./_ast.ts";
import { violation, type Rule, type Violation } from "../types.ts";

/** True when `expr` uses the caught error as text or as the value itself. */
function leaksError(expr: ts.Expression, name: string): string | null {
  let found: string | null = null;
  const isName = (n: ts.Node): boolean => {
    let x = n;
    while (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isNonNullExpression(x) || ts.isSatisfiesExpression(x)) {
      x = x.expression;
    }
    return ts.isIdentifier(x) && x.text === name;
  };
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isFunctionLike(n)) return; // a nested function is a different scope
    if (ts.isPropertyAccessExpression(n) && isName(n.expression) && (n.name.text === "message" || n.name.text === "stack")) {
      found = `${name}.${n.name.text}`;
    } else if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "String" && n.arguments.some(isName)) {
      found = `String(${name})`;
    } else if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && isName(n.expression.expression) && n.expression.name.text === "toString") {
      found = `${name}.toString()`;
    } else if (ts.isTemplateSpan(n) && isName(n.expression)) {
      found = `\${${name}}`;
    }
    ts.forEachChild(n, visit);
  };
  visit(expr);
  if (!found && isName(expr)) found = name;
  return found;
}

/** A Result error object: an object literal with `ok: false`. Errors inside it are allowed (they go in StepError fields). */
function isErrResult(expr: ts.Expression): boolean {
  let e = expr;
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression;
  if (!ts.isObjectLiteralExpression(e)) return false;
  return e.properties.some(
    (p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "ok" && p.initializer.kind === ts.SyntaxKind.FalseKeyword,
  );
}

export const R02: Rule = {
  id: "R02",
  name: "no-error-as-value",
  severity: "error",
  needs: [],
  scope: "file",
  check(ctx) {
    const { adapters } = ctx.config.folders;
    const out: Violation[] = [];
    for (const file of ctx.files) {
      const sf = parse(ctx, file);
      if (!sf) continue;
      const inLayer = inStepsLayer(file, ctx.config.folders) || inStripsLayer(file, ctx.config.folders) || isInside(file, adapters);
      eachNode(sf, (n) => {
        if (ts.isThrowStatement(n) && n.expression) {
          const e = n.expression;
          if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isTemplateExpression(e)) {
            out.push(violation(R02, file, lineOf(sf, n), "throws a string. Throw an Error, or return a Result error"));
          }
        }
        if (!inLayer || !ts.isCatchClause(n) || !n.variableDeclaration || !ts.isIdentifier(n.variableDeclaration.name)) return;
        const name = n.variableDeclaration.name.text;
        const scan = (node: ts.Node): void => {
          if (ts.isFunctionLike(node)) return;
          if (ts.isReturnStatement(node) && node.expression && !isErrResult(node.expression)) {
            const how = leaksError(node.expression, name);
            if (how) {
              out.push(violation(R02, file, lineOf(sf, node), `returns the caught error (${how}) as a value. Return a Result error ({ ok: false, error })`));
            }
          }
          ts.forEachChild(node, scan);
        };
        scan(n.block);
      });
    }
    return out;
  },
};
