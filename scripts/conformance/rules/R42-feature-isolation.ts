import { posix } from "node:path";
import { featureOf } from "../layout.ts";
import { importsOf, parse } from "./_ast.ts";
import { violation, type Rule, type Violation } from "../types.ts";

export const R42: Rule = {
  id: "R42",
  name: "feature-isolation",
  severity: "error",
  needs: [],
  scope: "file",
  check(ctx) {
    const folders = ctx.config.folders;
    const out: Violation[] = [];
    for (const file of ctx.files) {
      const owner = featureOf(file, folders);
      const sf = parse(ctx, file);
      if (!sf) continue;
      for (const imp of importsOf(sf)) {
        if (!imp.spec.startsWith(".")) continue;
        const target = posix.normalize(posix.join(posix.dirname(file), imp.spec));
        const into = featureOf(target, folders);
        if (into === null || into === "shared") continue;
        if (owner === into) continue;
        if (owner !== null && owner !== "shared") {
          out.push(violation(R42, file, imp.line, `feature "${owner}" imports feature "${into}" (${imp.spec}). Features must not depend on each other: move what both need to ${folders.shared}/`));
        } else if (owner === "shared") {
          out.push(violation(R42, file, imp.line, `${folders.shared} imports feature "${into}" (${imp.spec}). Shared code must not depend on a feature`));
        } else {
          const allowed = [`${folders.features}/${into}/index.ts`, `${folders.features}/${into}/page.tsx`];
          if (!allowed.includes(target)) {
            out.push(violation(R42, file, imp.line, `imports ${imp.spec}, inside feature "${into}". Outside code may import a feature only through ${folders.features}/${into}/index.ts, or its page.tsx from a route stub`));
          }
        }
      }
    }
    return out;
  },
};
