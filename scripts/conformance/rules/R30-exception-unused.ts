import { EXCEPTIONS_FILE } from "../exceptions.ts";
import { violation, type Rule, type Violation } from "../types.ts";

export const R30: Rule = {
  id: "R30",
  name: "exception-unused",
  severity: "warning",
  needs: [],
  scope: "project",
  phase: "post",
  check(ctx) {
    // A --files run filters violations first, so exceptions would look unused. Only judge full runs.
    if (ctx.scope) return [];
    const out: Violation[] = [];
    for (const e of ctx.exceptions?.unused ?? []) {
      out.push(violation(R30, EXCEPTIONS_FILE, 0, `exception for ${e.rule} on "${e.target}" (${e.date}) matches no violation. Remove it`));
    }
    return out;
  },
};
