import { violation, type Rule, type Violation } from "../types.ts";

const REQUIRED = ["name", "class", "input", "output", "permissions", "errors"];
const PERMISSIONS = ["reads", "writes", "storage"];

export const R10: Rule = {
  id: "R10",
  name: "step-manifest-complete",
  severity: "error",
  needs: ["steps"],
  scope: "file",
  check(ctx) {
    const out: Violation[] = [];
    for (const s of ctx.steps) {
      const missing = REQUIRED.filter((k) => !(k in s.props));
      const perms = s.props.permissions;
      if (perms && perms.kind === "object") {
        for (const k of PERMISSIONS) if (!(k in perms.props)) missing.push(`permissions.${k}`);
      }
      if (missing.length > 0) {
        const label = s.name ?? s.exportName ?? "(unnamed)";
        out.push(violation(R10, s.file, s.line, `step "${label}" manifest is missing: ${missing.join(", ")}`, s.name ?? undefined));
      }
    }
    return out;
  },
};
