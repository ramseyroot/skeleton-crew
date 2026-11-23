import { join } from "node:path";
import { readManifest } from "../feature.ts";
import { featureFolders } from "../layout.ts";
import { violation, type Rule, type Violation } from "../types.ts";

export const R45: Rule = {
  id: "R45",
  name: "feature-manifest",
  severity: "error",
  needs: [],
  scope: "project",
  check(ctx) {
    const { features } = ctx.config.folders;
    const out: Violation[] = [];
    for (const name of featureFolders(ctx.root, ctx.config.folders)) {
      const manifestFile = `${features}/${name}/feature.json`;
      const manifest = readManifest(ctx.root, ctx.config, name);
      if (typeof manifest === "string") {
        out.push(violation(R45, manifestFile, 0, `feature "${name}": ${manifest}`));
        continue;
      }
      const index = ctx.read(join(features, name, "index.ts"));
      const exported = new RegExp(`export\\s+(?:const|let|function)\\s+${manifest.module}\\b|export\\s*\\{[^}]*\\b${manifest.module}\\b`);
      if (index === null || !exported.test(index)) {
        out.push(violation(R45, manifestFile, 0, `feature "${name}": index.ts does not export "${manifest.module}", the name feature.json gives as its module`));
      }
    }
    return out;
  },
};
