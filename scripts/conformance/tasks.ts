// Parses tasks.md files: task IDs, done state, `Mode: sequential`, and `Writes:` lists.

import { matchGlob, readRel, walk } from "./files.ts";

export type Task = {
  id: string;
  title: string;
  done: boolean;
  sequential: boolean;
  /** Null when the task has no Writes: line. */
  writes: string[] | null;
  line: number;
  order: number;
};

export type TaskFile = { path: string; tasks: Task[] };

const TASK = /^- \[( |x|X)\] (\S+?)\.? (.+)$/;

export function parseTasks(text: string): Task[] {
  const tasks: Task[] = [];
  let cur: Task | null = null;
  text.split("\n").forEach((raw, i) => {
    const m = TASK.exec(raw);
    if (m) {
      cur = { id: (m[2] as string).replace(/\.$/, ""), title: (m[3] as string).trim(), done: m[1] !== " ", sequential: false, writes: null, line: i + 1, order: tasks.length };
      tasks.push(cur);
      return;
    }
    if (!cur || !/^\s+-\s+/.test(raw)) {
      if (cur && /^\S/.test(raw)) cur = null; // a new top-level element ends the task
      return;
    }
    const t = cur as Task;
    const body = raw.replace(/^\s+-\s+/, "");
    const mode = /^Mode:\s*(\S+)/i.exec(body);
    if (mode) t.sequential = (mode[1] as string).toLowerCase() === "sequential";
    const w = /^Writes:\s*(.*)$/i.exec(body);
    if (w) {
      t.writes = (w[1] as string)
        .split(",")
        .map((x) => x.trim().replace(/^`|`$/g, ""))
        .filter(Boolean);
    }
  });
  return tasks;
}

export function taskFiles(root: string, specsFolder: string): TaskFile[] {
  return walk(root, specsFolder, (f) => f.endsWith("/tasks.md")).map((path) => ({ path, tasks: parseTasks(readRel(root, path) ?? "") }));
}

const isFolderGlob = (p: string): boolean => p.endsWith("/**");

/** True when two Writes entries can name the same file. */
export function overlaps(a: string, b: string): boolean {
  if (a === b) return true;
  if (isFolderGlob(a) && isFolderGlob(b)) {
    const pa = a.slice(0, -2);
    const pb = b.slice(0, -2);
    return pa.startsWith(pb) || pb.startsWith(pa);
  }
  if (isFolderGlob(a) || a.includes("*")) return matchGlob(b, a);
  if (isFolderGlob(b) || b.includes("*")) return matchGlob(a, b);
  return false;
}

/** True when a Writes entry covers a file path. */
export function covers(entry: string, file: string): boolean {
  return entry === file || ((isFolderGlob(entry) || entry.includes("*")) && matchGlob(file, entry));
}
