import { violation, type Rule, type Violation } from "../types.ts";

export const R21: Rule = {
  id: "R21",
  name: "adapter-error-map",
  severity: "error",
  needs: ["ports"],
  scope: "project",
  check(ctx) {
    const out: Violation[] = [];
    for (const a of ctx.adapters) {
      if (!a.files.includes(`${a.dir}/errors.ts`)) {
        out.push(violation(R21, a.dir, 0, `adapter "${a.port}/${a.provider}" has no errors.ts mapping provider failures to ErrorKind`));
      }
    }
    return out;
  },
};
