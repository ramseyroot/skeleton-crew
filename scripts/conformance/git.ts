// Small git helpers. Every function degrades to "unknown" (null or empty) when git is unavailable.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { walk } from "./project.ts";

export function git(root: string, args: string[]): { ok: boolean; out: string } {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.stdout ?? "" };
}

export function hasHead(root: string): boolean {
  return git(root, ["rev-parse", "--verify", "--quiet", "HEAD"]).ok;
}

export function headId(root: string): string | null {
  const r = git(root, ["rev-parse", "HEAD"]);
  return r.ok ? r.out.trim() : null;
}

/** A file's content at HEAD, or null when it is not committed. */
export function showAtHead(root: string, rel: string): string | null {
  if (!hasHead(root)) return null;
  const r = git(root, ["show", `HEAD:${rel}`]);
  return r.ok ? r.out : null;
}

/** Repo-relative paths of all files at HEAD. */
export function filesAtHead(root: string): Set<string> {
  if (!hasHead(root)) return new Set();
  const r = git(root, ["ls-tree", "-r", "--name-only", "-z", "HEAD"]);
  return new Set(r.ok ? r.out.split("\0").filter(Boolean) : []);
}

/** Paths changed in the working tree compared with HEAD (modified, added, deleted, untracked). */
export function changedFiles(root: string): string[] {
  const r = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (!r.ok) return [];
  const out: string[] = [];
  const parts = r.out.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i] as string;
    if (entry.length < 4) continue;
    const status = entry.slice(0, 2);
    out.push(entry.slice(3));
    if (status.startsWith("R") || status.startsWith("C")) i++; // skip the rename source
  }
  return out.sort();
}

/** Commit date (YYYY-MM-DD) of the last commit that changed a file, or null. */
export function lastCommitDate(root: string, rel: string): string | null {
  const r = git(root, ["log", "-1", "--format=%cs", "--", rel]);
  const d = r.ok ? r.out.trim() : "";
  return d === "" ? null : d;
}

export function commitExists(root: string, id: string): boolean {
  return /^[0-9a-f]{4,40}$/i.test(id) && git(root, ["cat-file", "-e", `${id}^{commit}`]).ok;
}

/**
 * A fingerprint of the working tree, used to skip checks when nothing changed.
 * With git: HEAD plus the status and content of every changed file.
 * Without git: paths, sizes, and modification times of all files under the given folders.
 */
export function treeFingerprint(root: string, folders: string[]): string {
  const h = createHash("sha256");
  const head = headId(root);
  if (head !== null) {
    h.update(head);
    for (const f of changedFiles(root)) {
      h.update(`\0${f}\0`);
      try {
        h.update(readFileSync(join(root, f)));
      } catch {
        h.update("(deleted)");
      }
    }
    return h.digest("hex");
  }
  for (const dir of folders) {
    for (const f of walk(root, dir)) {
      try {
        const st = statSync(join(root, f));
        h.update(`${f}\0${st.size}\0${st.mtimeMs}\0`);
      } catch {
        h.update(`${f}\0(gone)\0`);
      }
    }
  }
  return h.digest("hex");
}
