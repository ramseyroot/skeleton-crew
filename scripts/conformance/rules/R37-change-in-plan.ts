import { changedFiles, filesAtHead } from "../git.ts";
import { activePlans, planAllows } from "../plans.ts";
import { isInside } from "../project.ts";
import { violation, type Rule, type Violation } from "../types.ts";

export const R37: Rule = {
  id: "R37",
  name: "change-in-plan",
  severity: "error",
  needs: ["git"],
  scope: "project",
  check(ctx) {
    const atHead = filesAtHead(ctx.root);
    const plans = activePlans(ctx.root, ctx.config.specsFolder);
    const out: Violation[] = [];
    for (const f of changedFiles(ctx.root)) {
      if (!atHead.has(f)) continue; // new files are allowed
      if (!ctx.config.guardedFolders.some((g) => isInside(f, g))) continue;
      if (planAllows(plans, f)) continue;
      out.push(violation(R37, f, 0, `existing file changed, but no active committed change plan lists it. Add it to the plan and have the user commit it, or undo the change`));
    }
    return out;
  },
};
