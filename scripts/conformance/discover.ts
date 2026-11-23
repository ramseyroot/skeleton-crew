// Finds defineStep() and defineStrip() calls, ports, and adapters (design D3).

import { join } from "node:path";
import { readdirSync } from "node:fs";
import { isDir, lineOf, toRel, ts, walk } from "./project.ts";
import type { AdapterInfo, PortInfo, StepInfo, StripInfo, Value } from "./types.ts";

function propKey(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function readValue(sf: ts.SourceFile, node: ts.Expression): Value {
  const line = lineOf(sf, node);
  let n: ts.Expression = node;
  while (ts.isAsExpression(n) || ts.isSatisfiesExpression(n) || ts.isParenthesizedExpression(n)) n = n.expression;
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return { kind: "string", value: n.text, line };
  if (ts.isArrayLiteralExpression(n)) {
    const els = n.elements;
    if (els.every((e) => ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e))) {
      return { kind: "strings", value: els.map((e) => (e as ts.StringLiteral).text), line };
    }
    if (els.length > 0 && els.every((e) => ts.isIdentifier(e))) {
      return { kind: "identifiers", value: els.map((e) => (e as ts.Identifier).text), line };
    }
  }
  if (ts.isObjectLiteralExpression(n)) return { kind: "object", props: readObject(sf, n), line };
  return { kind: "expr", text: node.getText(sf), line };
}

function readObject(sf: ts.SourceFile, obj: ts.ObjectLiteralExpression): Record<string, Value> {
  const props: Record<string, Value> = {};
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p)) {
      const key = propKey(p.name);
      if (key !== null) props[key] = readValue(sf, p.initializer);
    } else if (ts.isShorthandPropertyAssignment(p)) {
      props[p.name.text] = { kind: "expr", text: p.name.text, line: lineOf(sf, p) };
    } else if (ts.isMethodDeclaration(p) && p.name) {
      const key = propKey(p.name);
      if (key !== null) props[key] = { kind: "expr", text: p.getText(sf), line: lineOf(sf, p) };
    }
  }
  return props;
}

function calleeName(call: ts.CallExpression): string | null {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return null;
}

function exportNameOf(call: ts.CallExpression): string | null {
  let p: ts.Node = call.parent;
  while (ts.isAsExpression(p) || ts.isSatisfiesExpression(p) || ts.isParenthesizedExpression(p)) p = p.parent;
  if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  return null;
}

type Found = { kind: "step" | "strip"; call: ts.CallExpression; sf: ts.SourceFile };

export type Discovery = { steps: StepInfo[]; strips: StripInfo[] };

/** Reads every defineStep() and defineStrip() call in the program's source files. */
export function discoverDefinitions(root: string, program: ts.Program, files: string[]): Discovery {
  const wanted = new Set(files.map((f) => join(root, f)));
  const found: Found[] = [];
  for (const sf of program.getSourceFiles()) {
    if (!wanted.has(sf.fileName)) continue;
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const name = calleeName(node);
        if (name === "defineStep") found.push({ kind: "step", call: node, sf });
        if (name === "defineStrip") found.push({ kind: "strip", call: node, sf });
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  const stepByCall = new Map<ts.CallExpression, StepInfo>();
  const steps: StepInfo[] = [];
  const stripsFound: Found[] = [];
  for (const f of found) {
    if (f.kind === "strip") {
      stripsFound.push(f);
      continue;
    }
    const arg = f.call.arguments[0];
    const props = arg && ts.isObjectLiteralExpression(arg) ? readObject(f.sf, arg) : {};
    const nameVal = props.name;
    const info: StepInfo = {
      file: toRel(root, f.sf.fileName),
      line: lineOf(f.sf, f.call),
      exportName: exportNameOf(f.call),
      props,
      name: nameVal && nameVal.kind === "string" ? nameVal.value : null,
    };
    stepByCall.set(f.call, info);
    steps.push(info);
  }

  const checker = program.getTypeChecker();
  const resolveStep = (id: ts.Identifier): StepInfo | null => {
    let sym = checker.getSymbolAtLocation(id);
    if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
    const decl = sym?.declarations?.[0];
    if (!decl || !ts.isVariableDeclaration(decl) || !decl.initializer) return null;
    let init: ts.Expression = decl.initializer;
    while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init) || ts.isParenthesizedExpression(init)) {
      init = init.expression;
    }
    return ts.isCallExpression(init) ? (stepByCall.get(init) ?? null) : null;
  };

  const strips: StripInfo[] = [];
  for (const f of stripsFound) {
    const arg = f.call.arguments[0];
    const obj = arg && ts.isObjectLiteralExpression(arg) ? arg : null;
    const props = obj ? readObject(f.sf, obj) : {};
    const stepRefs: StripInfo["stepRefs"] = [];
    const stepsProp = obj?.properties.find(
      (p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && propKey(p.name) === "steps",
    );
    if (stepsProp && ts.isArrayLiteralExpression(stepsProp.initializer)) {
      for (const el of stepsProp.initializer.elements) {
        stepRefs.push({
          text: el.getText(f.sf),
          line: lineOf(f.sf, el),
          step: ts.isIdentifier(el) ? resolveStep(el) : null,
        });
      }
    }
    const nameVal = props.name;
    strips.push({
      file: toRel(root, f.sf.fileName),
      line: lineOf(f.sf, f.call),
      exportName: exportNameOf(f.call),
      props,
      name: nameVal && nameVal.kind === "string" ? nameVal.value : null,
      stepRefs,
    });
  }

  const byPos = (a: { file: string; line: number }, b: { file: string; line: number }): number =>
    a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line;
  return { steps: steps.sort(byPos), strips: strips.sort(byPos) };
}

/** Ports are the .ts files directly in the ports folder (tests excluded). */
export function discoverPorts(root: string, portsDir: string): PortInfo[] {
  if (!isDir(join(root, portsDir))) return [];
  return readdirSync(join(root, portsDir), { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") && !e.name.endsWith(".d.ts"))
    .map((e) => ({ name: e.name.slice(0, -3), file: `${portsDir}/${e.name}` }))
    .sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** Adapters are the folders `adapters/<port>/<provider>/`. */
export function discoverAdapters(root: string, adaptersDir: string): AdapterInfo[] {
  const out: AdapterInfo[] = [];
  if (!isDir(join(root, adaptersDir))) return out;
  for (const portEntry of readdirSync(join(root, adaptersDir), { withFileTypes: true })) {
    if (!portEntry.isDirectory()) continue;
    const portDir = `${adaptersDir}/${portEntry.name}`;
    for (const provEntry of readdirSync(join(root, portDir), { withFileTypes: true })) {
      if (!provEntry.isDirectory()) continue;
      const dir = `${portDir}/${provEntry.name}`;
      out.push({ port: portEntry.name, provider: provEntry.name, dir, files: walk(root, dir) });
    }
  }
  return out.sort((a, b) => (a.dir < b.dir ? -1 : 1));
}
