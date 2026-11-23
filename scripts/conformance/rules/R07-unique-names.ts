import { violation, type Rule, type Violation } from "../types.ts";

type Named = { name: string | null; file: string; line: number };

function duplicates(items: Named[], kind: string): Violation[] {
  const by = new Map<string, Named[]>();
  for (const i of items) {
    if (i.name === null) continue;
    const list = by.get(i.name);
    if (list) list.push(i);
    else by.set(i.name, [i]);
  }
  const out: Violation[] = [];
  for (const [name, list] of by) {
    if (list.length < 2) continue;
    for (const i of list) {
      const others = list.filter((o) => o !== i).map((o) => `${o.file}:${o.line}`);
      out.push(violation(R07, i.file, i.line, `${kind} name "${name}" is also used at ${others.join(", ")}`, name));
    }
  }
  return out;
}

export const R07: Rule = {
  id: "R07",
  name: "unique-names",
  severity: "error",
  needs: ["steps"],
  scope: "project",
  check(ctx) {
    return [...duplicates(ctx.steps, "step"), ...duplicates(ctx.strips, "strip")];
  },
};
