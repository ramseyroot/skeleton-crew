// File and path helpers with no TypeScript dependency, so hooks can use them without loading the compiler.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, matchesGlob, relative, sep } from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git", ".worktrees", ".conformance"]);

/** Converts an OS path to a repo-relative path with forward slashes. */
export function toRel(root: string, abs: string): string {
  return relative(root, abs).split(sep).join("/");
}

/** Matches a repo-relative path against a glob. A pattern ending in "/**" also matches the folder itself. */
export function matchGlob(path: string, pattern: string): boolean {
  if (pattern.endsWith("/**") && path === pattern.slice(0, -3)) return true;
  return matchesGlob(path, pattern);
}

/** True when `path` is `folder` or inside it. Both repo-relative. */
export function isInside(path: string, folder: string): boolean {
  const f = folder.replace(/\/+$/, "");
  return path === f || path.startsWith(`${f}/`);
}

export function isDir(abs: string): boolean {
  try {
    return statSync(abs).isDirectory();
  } catch {
    return false;
  }
}

/** Lists repo-relative files under `dir` (repo-relative), recursively, sorted. */
export function walk(root: string, dir: string, keep: (rel: string) => boolean = () => true): string[] {
  const out: string[] = [];
  const start = join(root, dir);
  if (!isDir(start)) return out;
  const stack = [start];
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    for (const entry of readdirSync(cur, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const abs = join(cur, entry.name);
      if (entry.isDirectory()) stack.push(abs);
      else if (entry.isFile()) {
        const rel = toRel(root, abs);
        if (keep(rel)) out.push(rel);
      }
    }
  }
  return out.sort();
}

export function isSourceFile(rel: string): boolean {
  return (rel.endsWith(".ts") || rel.endsWith(".tsx")) && !rel.endsWith(".d.ts");
}

/** Source files under the configured roots. */
export function listSourceFiles(root: string, sourceRoots: string[]): string[] {
  const all = new Set<string>();
  for (const r of sourceRoots) for (const f of walk(root, r, isSourceFile)) all.add(f);
  return [...all].sort();
}

export function readRel(root: string, rel: string): string | null {
  const abs = join(root, rel);
  if (!existsSync(abs)) return null;
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

export function isGitRepo(root: string): boolean {
  return existsSync(join(root, ".git"));
}
