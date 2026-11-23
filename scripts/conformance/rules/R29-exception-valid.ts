import { EXCEPTIONS_FILE } from "../exceptions.ts";
import { rules } from "./index.ts";
import { violation, type Rule, type Violation } from "../types.ts";

export const R29: Rule = {
  id: "R29",
  name: "exception-valid",
  severity: "error",
  needs: [],
  scope: "project",
  phase: "post",
  check(ctx) {
    const raw = ctx.exceptions?.raw ?? [];
    const known = new Set(rules.flatMap((r) => [r.id, r.name]));
    const out: Violation[] = [];
    raw.forEach((entry, i) => {
      const at = `entry ${i + 1}`;
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        out.push(violation(R29, EXCEPTIONS_FILE, 0, `${at} is not an object`));
        return;
      }
      const e = entry as Record<string, unknown>;
      const missing = ["rule", "target", "reason", "date"].filter((k) => typeof e[k] !== "string" || (e[k] as string).trim() === "");
      if (missing.length > 0) out.push(violation(R29, EXCEPTIONS_FILE, 0, `${at} is missing ${missing.join(", ")}. Every exception needs a rule, a target, a reason, and a date`));
      if (typeof e.rule === "string" && e.rule !== "" && !known.has(e.rule)) out.push(violation(R29, EXCEPTIONS_FILE, 0, `${at} names unknown rule "${e.rule}"`));
      if (typeof e.date === "string" && e.date !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) out.push(violation(R29, EXCEPTIONS_FILE, 0, `${at} date "${e.date}" is not YYYY-MM-DD`));
    });
    return out;
  },
};
