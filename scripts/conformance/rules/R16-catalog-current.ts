import { buildCatalog, CATALOG_JSON, CATALOG_MD, catalogJson, catalogMd } from "../catalog.ts";
import { violation, type Rule, type Violation } from "../types.ts";

export const R16: Rule = {
  id: "R16",
  name: "catalog-current",
  severity: "error",
  needs: ["steps"],
  scope: "project",
  check(ctx) {
    const c = buildCatalog(ctx);
    const out: Violation[] = [];
    for (const [file, want] of [
      [CATALOG_JSON, catalogJson(c)],
      [CATALOG_MD, catalogMd(c)],
    ] as const) {
      const have = ctx.read(file);
      if (have === null) out.push(violation(R16, file, 0, "catalog file is missing. Run pnpm conformance --write-catalog"));
      else if (have !== want) out.push(violation(R16, file, 0, "catalog is out of date with the code. Run pnpm conformance --write-catalog and commit the result"));
    }
    return out;
  },
};
