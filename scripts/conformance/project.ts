// The TypeScript program. All compiler API use is in this file and discover.ts (design D1 revision).
// File helpers live in files.ts and are re-exported here for existing imports.

import ts from "ts-api";
import { join } from "node:path";
import { toRel } from "./files.ts";

export { isDir, isGitRepo, isInside, isSourceFile, listSourceFiles, matchGlob, readRel, toRel, walk } from "./files.ts";

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  allowImportingTsExtensions: true,
  noEmit: true,
  skipLibCheck: true,
  jsx: ts.JsxEmit.Preserve,
  types: [],
  // Rules read syntax and follow imports. They do not need the standard library types, and skipping them is much faster.
  noLib: true,
};

/** Builds a program over the given repo-relative files. Parse errors are returned, never ignored. */
export function createProgram(root: string, files: string[]): { program: ts.Program; parseErrors: string[] } {
  // setParentNodes: discovery walks up from calls to their declarations.
  const host = ts.createCompilerHost(COMPILER_OPTIONS, true);
  const program = ts.createProgram(
    files.map((f) => join(root, f)),
    COMPILER_OPTIONS,
    host,
  );
  const parseErrors: string[] = [];
  for (const d of program.getSyntacticDiagnostics()) {
    const where = d.file ? toRel(root, d.file.fileName) : "(unknown file)";
    const line = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : 0;
    parseErrors.push(`${where}:${line}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`);
  }
  return { program, parseErrors };
}

export function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

export { ts };
