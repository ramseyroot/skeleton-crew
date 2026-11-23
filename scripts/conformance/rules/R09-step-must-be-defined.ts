import { isInside, isTestFile, lineOf, parse, ts } from "./_ast.ts";
import { violation, type Rule, type Violation } from "../types.ts";

function isDefineStepCall(e: ts.Expression | undefined): boolean {
  let x = e;
  while (x && (ts.isAsExpression(x) || ts.isSatisfiesExpression(x) || ts.isParenthesizedExpression(x))) x = x.expression;
  if (!x || !ts.isCallExpression(x)) return false;
  const c = x.expression;
  return (ts.isIdentifier(c) && c.text === "defineStep") || (ts.isPropertyAccessExpression(c) && c.name.text === "defineStep");
}

const isExported = (n: ts.Node): boolean =>
  ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

export const R09: Rule = {
  id: "R09",
  name: "step-must-be-defined",
  severity: "error",
  needs: ["steps"],
  scope: "file",
  check(ctx) {
    const out: Violation[] = [];
    for (const file of ctx.files) {
      if (!isInside(file, ctx.config.folders.steps) || isTestFile(file)) continue;
      const sf = parse(ctx, file);
      if (!sf) continue;
      const locals = new Map<string, boolean>();
      for (const st of sf.statements) {
        if (ts.isVariableStatement(st)) {
          for (const d of st.declarationList.declarations) {
            if (ts.isIdentifier(d.name)) locals.set(d.name.text, isDefineStepCall(d.initializer));
          }
        }
      }
      const report = (n: ts.Node, what: string): void => {
        out.push(violation(R09, file, lineOf(sf, n), `${what}: exported from a steps file but not created with defineStep()`));
      };
      for (const st of sf.statements) {
        if (ts.isVariableStatement(st) && isExported(st)) {
          for (const d of st.declarationList.declarations) {
            if (!isDefineStepCall(d.initializer)) report(d, `"${d.name.getText(sf)}"`);
          }
        } else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && isExported(st)) {
          report(st, `"${st.name?.text ?? "default"}"`);
        } else if (ts.isExportAssignment(st)) {
          if (!isDefineStepCall(st.expression)) report(st, "the default export");
        } else if (ts.isExportDeclaration(st) && !st.moduleSpecifier && !st.isTypeOnly && st.exportClause && ts.isNamedExports(st.exportClause)) {
          for (const el of st.exportClause.elements) {
            if (el.isTypeOnly) continue;
            const local = (el.propertyName ?? el.name).text;
            if (locals.get(local) !== true) report(st, `"${el.name.text}"`);
          }
        }
      }
    }
    return out;
  },
};
