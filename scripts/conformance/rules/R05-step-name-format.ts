import { isInside } from "./_ast.ts";
import { violation, type Rule, type Violation } from "../types.ts";

const FORMAT = /^([a-z][a-zA-Z0-9]*)\.([a-z][a-zA-Z0-9]*)\.([a-z][a-zA-Z0-9]*)$/;

export const R05: Rule = {
  id: "R05",
  name: "step-name-format",
  severity: "error",
  needs: ["steps"],
  scope: "file",
  check(ctx) {
    const { classes } = ctx.config;
    const out: Violation[] = [];
    for (const s of ctx.steps) {
      if (s.name === null) continue; // missing or non-literal names are R10 and R11
      const problems: string[] = [];
      const m = FORMAT.exec(s.name);
      const field = s.props.class;
      const declared = field && field.kind === "string" ? field.value : null;
      if (declared !== null && !classes.includes(declared)) problems.push(`class "${declared}" is not one of ${classes.join(", ")}`);
      if (!m) {
        problems.push(`name does not match <class>.<domain>.<verb>`);
      } else {
        const nameClass = m[1] as string;
        if (!classes.includes(nameClass) && nameClass !== declared) problems.push(`"${nameClass}" in the name is not a known class`);
        if (declared !== null && nameClass !== declared) problems.push(`name starts with "${nameClass}" but class is "${declared}"`);
      }
      const cls = declared ?? m?.[1];
      if (cls && !isInside(s.file, `${ctx.config.folders.steps}/${cls}`)) {
        problems.push(`file is not in ${ctx.config.folders.steps}/${cls}/`);
      }
      if (problems.length > 0) out.push(violation(R05, s.file, s.line, `step "${s.name}": ${problems.join("; ")}`, s.name));
    }
    return out;
  },
};
