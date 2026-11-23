import { violation, type Rule, type Violation } from "../types.ts";

const FORMAT = /^[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/;

export const R06: Rule = {
  id: "R06",
  name: "strip-name-format",
  severity: "error",
  needs: ["strips"],
  scope: "file",
  check(ctx) {
    const out: Violation[] = [];
    for (const s of ctx.strips) {
      if (s.name === null || FORMAT.test(s.name)) continue;
      out.push(violation(R06, s.file, s.line, `strip "${s.name}": name does not match <domain>.<verb>`, s.name));
    }
    return out;
  },
};
