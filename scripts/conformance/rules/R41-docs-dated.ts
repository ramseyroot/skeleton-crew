import { lastCommitDate } from "../git.ts";
import { isInside, walk } from "../project.ts";
import { violation, type Rule, type Violation } from "../types.ts";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function dates(text: string): { created: string | null; updated: string | null } {
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  const get = (k: string): string | null => {
    if (!m) return null;
    const v = new RegExp(`^${k}:\\s*(\\S+)`, "m").exec(m[1] as string);
    return v ? (v[1] as string) : null;
  };
  return { created: get("created"), updated: get("updated") };
}

export const R41: Rule = {
  id: "R41",
  name: "docs-dated",
  severity: "error",
  needs: [],
  scope: "file",
  check(ctx) {
    const files = [
      ...walk(ctx.root, "docs", (f) => f.endsWith(".md") && !isInside(f, "docs/generated")),
      ...walk(ctx.root, ctx.config.specsFolder, (f) => f.endsWith(".md")),
    ];
    const useGit = ctx.has.has("git");
    const out: Violation[] = [];
    for (const file of files) {
      const { created, updated } = dates(ctx.read(file) ?? "");
      const missing = [created && DATE.test(created) ? null : "created", updated && DATE.test(updated) ? null : "updated"].filter(Boolean);
      if (missing.length > 0) {
        out.push(violation(R41, file, 0, `front matter needs ${missing.join(" and ")} as YYYY-MM-DD`));
        continue;
      }
      const last = useGit ? lastCommitDate(ctx.root, file) : null;
      if (last !== null && (updated as string) < last) {
        out.push(violation(R41, file, 0, `updated is ${updated}, but the file was last committed on ${last}. Update the date when you change the file`));
      }
    }
    return out;
  },
};
