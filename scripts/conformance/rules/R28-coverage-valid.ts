import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { walk } from "../project.ts";
import { violation, type Rule, type Violation } from "../types.ts";

// The coverage checker that ships with the skeleton (scripts/check-coverage.mjs).
const CHECKER = fileURLToPath(new URL("../../check-coverage.mjs", import.meta.url));

export const R28: Rule = {
  id: "R28",
  name: "coverage-valid",
  severity: "error",
  needs: ["coverage"],
  scope: "project",
  check(ctx) {
    const out: Violation[] = [];
    for (const file of walk(ctx.root, ctx.config.folders.coverage, (f) => f.endsWith(".md"))) {
      const r = spawnSync(process.execPath, [CHECKER, join(ctx.root, file), `--root=${ctx.root}`], { encoding: "utf8" });
      if (r.status !== 0 && r.status !== 1) {
        out.push(violation(R28, file, 0, `coverage checker failed: ${(r.stderr || "no output").trim()}`));
        continue;
      }
      let section: "gaps" | "errors" | null = null;
      for (const line of (r.stdout ?? "").split("\n")) {
        if (line.startsWith("Gaps")) section = "gaps";
        else if (line.startsWith("Errors")) section = "errors";
        else if (line.startsWith("  - ") && section) {
          const item = line.slice(4);
          if (section === "errors") out.push(violation(R28, file, 0, `coverage: ${item}`));
          else out.push({ ...violation(R28, file, 0, `coverage gap (unplanned): ${item}`), severity: "warning" });
        }
      }
    }
    return out;
  },
};
