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

    // Features: every listed feature exists, and every feature with a manifest is either fully enabled or fully disabled.
    const list = `${dirname(features)}/app/features.ts`;
    const listText = ctx.read(list);
    if (listText !== null) {
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
      for (const [f, line] of imported) {
        if (!folders.includes(f) || ctx.read(join(features, f, "index.ts")) === null) {
          out.push(violation(R44, list, line, `${list} lists feature "${f}", which has no ${features}/${f}/index.ts`));
        }
      }
      for (const f of folders) {
        const raw = ctx.read(join(features, f, "feature.json"));
        if (raw === null) continue; // a missing or invalid manifest is reported by R45
        let manifest: { module?: unknown; routes?: unknown };
        try {
          manifest = JSON.parse(raw) as { module?: unknown; routes?: unknown };
        } catch {
          continue;
        }
        if (typeof manifest.module !== "string" || !Array.isArray(manifest.routes)) continue;
        const listed = imported.has(f) && new RegExp(`^\\s*${manifest.module},\\s*$`, "m").test(listText);
        const stubs = (manifest.routes as { stub?: unknown }[]).map((r) => (typeof r.stub === "string" ? r.stub : ""));
        const present = stubs.filter((s) => s !== "" && ctx.read(s) !== null).length;
        if (stubs.length === 0) continue; // no stubs to compare with: the list alone decides
        if (listed && present < stubs.length) {
          out.push(violation(R44, list, imported.get(f) ?? 0, `feature "${f}" is listed but ${stubs.length - present} of its ${stubs.length} route stub(s) are missing. Run \`pnpm feature enable ${f} --yes\`, or disable it`));
        } else if (!listed && present > 0) {
          out.push(violation(R44, list, 0, `feature "${f}" has ${present} route stub(s) but ${list} does not list it. Run \`pnpm feature enable ${f} --yes\`, or delete the stubs`));
        }
      }
    }
    return out;
  },
};
