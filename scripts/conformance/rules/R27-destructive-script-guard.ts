import { matchGlob, walk } from "../project.ts";
import { violation, type Rule, type Violation } from "../types.ts";

export const R27: Rule = {
  id: "R27",
  name: "destructive-script-guard",
  severity: "error",
  needs: [],
  scope: "file",
  check(ctx) {
    const { globs, guardCall } = ctx.config.destructiveScripts;
    const roots = [...new Set(globs.map((g) => g.split("/")[0] as string))];
    const out: Violation[] = [];
    for (const root of roots) {
      for (const file of walk(ctx.root, root, (f) => globs.some((g) => matchGlob(f, g)))) {
        const text = ctx.read(file) ?? "";
        if (!new RegExp(`\\b${guardCall.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(`).test(text)) {
          out.push(violation(R27, file, 0, `destructive script does not call ${guardCall}(), so it could run against production`));
        }
      }
    }
    return out;
  },
};
