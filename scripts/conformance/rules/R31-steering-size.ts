import { walk } from "../project.ts";
import { violation, type Rule, type Violation } from "../types.ts";

const DIR = ".kiro/steering";
const TOTAL_CHARS = 100_000; // documented resource budget for custom agents

function inclusion(text: string): string {
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  const inc = m ? /^inclusion:\s*(\S+)/m.exec(m[1] as string) : null;
  return inc ? (inc[1] as string) : "always"; // no front matter means always
}

export const R31: Rule = {
  id: "R31",
  name: "steering-size",
  severity: "error",
  needs: ["steering"],
  scope: "project",
  check(ctx) {
    const { alwaysMaxLines, otherMaxLines } = ctx.config.steering;
    const out: Violation[] = [];
    let total = 0;
    for (const file of walk(ctx.root, DIR, (f) => f.endsWith(".md"))) {
      const text = ctx.read(file) ?? "";
      total += text.length;
      const lines = text.replace(/\n$/, "").split("\n").length;
      const mode = inclusion(text);
      const max = mode === "always" ? alwaysMaxLines : otherMaxLines;
      if (lines > max) out.push(violation(R31, file, 0, `${mode} steering file has ${lines} lines, over the limit of ${max}`));
    }
    if (total > TOTAL_CHARS) out.push(violation(R31, DIR, 0, `steering files total ${total} characters, over the ${TOTAL_CHARS} budget`));
    return out;
  },
};
