import { buildCatalog, CATALOG_JSON, parseCatalog, type Permissions } from "../catalog.ts";
import { showAtHead } from "../git.ts";
import { violation, type Rule, type Violation } from "../types.ts";

const CATS = ["reads", "writes", "storage"] as const;

export const R17: Rule = {
  id: "R17",
  name: "no-widening",
  severity: "error",
  needs: ["git"],
  scope: "project",
  check(ctx) {
    const before = parseCatalog(showAtHead(ctx.root, CATALOG_JSON));
    if (!before) return []; // no committed catalog yet: the first commit sets the baseline
    const now = buildCatalog(ctx);
    const old = new Map(before.steps.map((s) => [s.name, s]));
    const out: Violation[] = [];
    for (const s of now.steps) {
      const prev = old.get(s.name);
      if (!prev) continue; // a new step, not a widening
      const changes: string[] = [];
      const p0: Permissions = prev.permissions ?? { reads: [], writes: [], storage: [] };
      const p1: Permissions = s.permissions ?? { reads: [], writes: [], storage: [] };
      for (const c of CATS) {
        const added = p1[c].filter((x) => !p0[c].includes(x));
        if (added.length > 0) changes.push(`${c} gained ${added.join(", ")} (was ${p0[c].join(", ") || "none"})`);
      }
      if (prev.input !== s.input) changes.push(`input changed from ${prev.input ?? "?"} to ${s.input ?? "?"}`);
      if (prev.output !== s.output) changes.push(`output changed from ${prev.output ?? "?"} to ${s.output ?? "?"}`);
      if (changes.length === 0) continue;
      const info = ctx.steps.find((x) => x.name === s.name);
      out.push(
        violation(R17, info?.file ?? s.file, info?.line ?? 0, `step "${s.name}" contract changed since the last commit: ${changes.join("; ")}. Create a new step, or record an approved exception`, s.name),
      );
    }
    return out;
  },
};
