// Shared helpers for rules: parsing single files, walking nodes, reading imports.

import { isInside, lineOf, ts } from "../project.ts";
import type { Context } from "../types.ts";

const cache = new Map<string, { text: string; sf: ts.SourceFile }>();

/** Parses a repo-relative file, cached by content. Returns null when the file cannot be read. */
export function parse(ctx: Context, rel: string): ts.SourceFile | null {
  const text = ctx.read(rel);
  if (text === null) return null;
  const key = `${ctx.root}\0${rel}`;
  const hit = cache.get(key);
  if (hit && hit.text === text) return hit.sf;
  const kind = rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
  cache.set(key, { text, sf });
  return sf;
}

/** Calls fn on every node, depth first. */
export function eachNode(root: ts.Node, fn: (n: ts.Node) => void): void {
  const visit = (n: ts.Node): void => {
    fn(n);
    ts.forEachChild(n, visit);
  };
  visit(root);
}

export { lineOf, isInside, ts };

export type ImportRef = { spec: string; line: number };

/** Module specifiers used by a file: import, export-from, dynamic import(), and require(). */
export function importsOf(sf: ts.SourceFile): ImportRef[] {
  const out: ImportRef[] = [];
  eachNode(sf, (n) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      out.push({ spec: n.moduleSpecifier.text, line: lineOf(sf, n) });
    } else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference)) {
      const e = n.moduleReference.expression;
      if (ts.isStringLiteral(e)) out.push({ spec: e.text, line: lineOf(sf, n) });
    } else if (ts.isCallExpression(n) && n.arguments.length > 0 && ts.isStringLiteral(n.arguments[0] as ts.Expression)) {
      const isImport = n.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(n.expression) && n.expression.text === "require";
      if (isImport || isRequire) out.push({ spec: (n.arguments[0] as ts.StringLiteral).text, line: lineOf(sf, n) });
    }
  });
  return out;
}

/** The package name of a bare specifier ("@scope/pkg/sub" gives "@scope/pkg"), or null for relative paths. */
export function packageName(spec: string): string | null {
  if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("node:")) return null;
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? null);
}

/** Matches a specifier against provider package patterns, where `*` matches within one path segment. */
export function matchesPackage(spec: string, patterns: string[]): string | null {
  const name = packageName(spec);
  if (name === null) return null;
  for (const p of patterns) {
    const re = new RegExp(`^${p.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")}$`);
    if (re.test(name)) return p;
  }
  return null;
}

/** True when the file is inside `<adapters>/<port>/<provider>/`. */
export function isInAdapterProvider(file: string, adaptersDir: string): boolean {
  if (!isInside(file, adaptersDir)) return false;
  const rest = file.slice(adaptersDir.replace(/\/+$/, "").length + 1).split("/");
  return rest.length >= 3;
}

export function isTestFile(file: string): boolean {
  return /\.test\.tsx?$/.test(file);
}
