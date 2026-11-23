import { violation, type Rule, type Violation } from "../types.ts";

/**
 * Normalizes a name for near-duplicate comparison: split on dots and camelCase,
 * lowercase, and drop common verbs. "db.user.getByEmail" and "db.user.findByEmail" give the same key.
 * Shared with R39 (plan-no-near-duplicates).
 */
export function nearDuplicateKey(name: string, verbs: string[]): string {
  const drop = new Set(verbs.map((v) => v.toLowerCase()));
  return name
    .split(".")
    .flatMap((seg) => seg.split(/(?=[A-Z])/))
    .map((w) => w.toLowerCase())
    .filter((w) => w !== "" && !drop.has(w))
    .join(".");
}

type Named = { name: string | null; file: string; line: number };

function near(items: Named[], verbs: string[], kind: string): Violation[] {
  const firstByKey = new Map<string, Named>();
  const out: Violation[] = [];
  for (const i of items) {
    if (i.name === null) continue;
    const key = nearDuplicateKey(i.name, verbs);
    const first = firstByKey.get(key);
    if (!first) {
      firstByKey.set(key, i);
    } else if (first.name !== i.name) {
      out.push(violation(R08, i.file, i.line, `${kind} "${i.name}" is a near-duplicate of "${first.name}" (${first.file}:${first.line})`, i.name));
    }
  }
  return out;
}

export const R08: Rule = {
  id: "R08",
  name: "near-duplicate-names",
  severity: "warning",
  needs: ["steps"],
  scope: "project",
  check(ctx) {
    const verbs = ctx.config.nearDuplicateVerbs;
    return [...near(ctx.steps, verbs, "step"), ...near(ctx.strips, verbs, "strip")];
  },
};
