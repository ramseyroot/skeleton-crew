import { dirname, join, posix } from "node:path";
import { featureFolders } from "../layout.ts";
import { importsOf, parse } from "./_ast.ts";
import { violation, type Rule, type Violation } from "../types.ts";

export const R44: Rule = {
  id: "R44",
  name: "registry-matches-folders",
  severity: "error",
  needs: [],
  scope: "project",
  check(ctx) {
    const { adapters, features, config } = ctx.config.folders;
    const out: Violation[] = [];

    // Adapters: every adapter folder is imported by the registry, and every adapter the registry imports exists.
    const registry = `${config}/registry.ts`;
    if (ctx.read(registry) !== null) {
      const sf = parse(ctx, registry);
      const imported = new Set<string>();
      const lineOf = new Map<string, number>();
      if (sf) {
        for (const imp of importsOf(sf)) {
          const target = posix.normalize(posix.join(posix.dirname(registry), imp.spec));
          const m = new RegExp(`^${adapters}/([^/]+)/([^/]+)/`).exec(target);
          if (m) {
            const key = `${m[1]}/${m[2]}`;
            imported.add(key);
            lineOf.set(key, imp.line);
          }
        }
      }
      const present = new Set(ctx.adapters.map((a) => `${a.port}/${a.provider}`));
      for (const a of ctx.adapters) {
        const key = `${a.port}/${a.provider}`;
        if (!imported.has(key)) out.push(violation(R44, registry, 0, `adapter ${adapters}/${key}/ exists but the registry does not import it. Add its line, or delete the folder`));
      }
      for (const key of imported) {
        if (!present.has(key)) out.push(violation(R44, registry, lineOf.get(key) ?? 0, `the registry imports ${adapters}/${key}/, which does not exist`));
      }
    }

    // Features: every feature folder is listed in the app's feature list, and every listed feature exists.
    const list = `${dirname(features)}/app/features.ts`;
    if (ctx.read(list) !== null) {
      const sf = parse(ctx, list);
      const imported = new Map<string, number>();
      if (sf) {
        for (const imp of importsOf(sf)) {
          const target = posix.normalize(posix.join(posix.dirname(list), imp.spec));
          const m = new RegExp(`^${features}/([^/]+)/`).exec(target);
          if (m) imported.set(m[1] as string, imp.line);
        }
      }
      const folders = featureFolders(ctx.root, ctx.config.folders);
      for (const f of folders) {
        if (!imported.has(f)) out.push(violation(R44, list, 0, `feature ${features}/${f}/ exists but ${list} does not list it. Add its line, or delete the folder`));
      }
      for (const [f, line] of imported) {
        if (!folders.includes(f) || !ctx.read(join(features, f, "index.ts"))) {
          out.push(violation(R44, list, line, `${list} lists feature "${f}", which has no ${features}/${f}/index.ts`));
        }
      }
    }
    return out;
  },
};
