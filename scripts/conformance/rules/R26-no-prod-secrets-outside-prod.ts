import { readdirSync } from "node:fs";
import { violation, type Rule, type Violation } from "../types.ts";

export const R26: Rule = {
  id: "R26",
  name: "no-prod-secrets-outside-prod",
  severity: "error",
  needs: [],
  scope: "project",
  check(ctx) {
    const names = new Set(ctx.config.prodSecretNames);
    if (names.size === 0) return [];
    const out: Violation[] = [];
    const envFiles = readdirSync(ctx.root).filter((f) => f.startsWith(".env") && !/prod/i.test(f)).sort();
    for (const file of envFiles) {
      const lines = (ctx.read(file) ?? "").split("\n");
      lines.forEach((raw, i) => {
        const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(raw);
        if (!m) return;
        const value = (m[2] ?? "").replace(/^["']|["']$/g, "").trim();
        if (names.has(m[1] as string) && value !== "") {
          out.push(violation(R26, file, i + 1, `production secret ${m[1]} has a value in ${file}. Production secrets live only in the production environment`));
        }
      });
    }
    return out;
  },
};
