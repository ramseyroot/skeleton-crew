import { importsOf, isTestFile, parse } from "./_ast.ts";
import { violation, type Rule, type Violation } from "../types.ts";

const CONTRACT = /^\.\.\/contract\.test(\.ts)?$/;

export const R20: Rule = {
  id: "R20",
  name: "adapter-runs-contract",
  severity: "error",
  needs: ["ports"],
  scope: "project",
  check(ctx) {
    const out: Violation[] = [];
    for (const a of ctx.adapters) {
      const runs = a.files.filter(isTestFile).some((f) => {
        const sf = parse(ctx, f);
        return sf !== null && importsOf(sf).some((i) => CONTRACT.test(i.spec));
      });
      if (!runs) {
        out.push(violation(R20, a.dir, 0, `adapter "${a.port}/${a.provider}" has no test that imports ../contract.test.ts, so the port's contract is not checked against it`));
      }
    }
    return out;
  },
};
