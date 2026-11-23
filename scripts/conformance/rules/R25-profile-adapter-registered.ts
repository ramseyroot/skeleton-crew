import { join } from "node:path";
import { isDir } from "../project.ts";
import { loadProfiles } from "./R23-profile-valid.ts";
import { violation, type Rule, type Violation } from "../types.ts";

export const R25: Rule = {
  id: "R25",
  name: "profile-adapter-registered",
  severity: "error",
  needs: ["profiles"],
  scope: "project",
  check(ctx) {
    const p = loadProfiles(ctx);
    if (p.error || !p.profiles) return [];
    const out: Violation[] = [];
    for (const [name, profile] of Object.entries(p.profiles)) {
      const adapters = profile.adapters && typeof profile.adapters === "object" ? profile.adapters : {};
      for (const [port, adapter] of Object.entries(adapters)) {
        const dir = `${ctx.config.folders.adapters}/${port}/${String(adapter)}`;
        if (!isDir(join(ctx.root, dir))) {
          out.push(violation(R25, p.file, p.lineOf(name), `profile "${name}" uses adapter "${String(adapter)}" for port "${port}", but ${dir}/ does not exist`));
        }
      }
    }
    return out;
  },
};
