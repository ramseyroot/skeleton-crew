import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { violation, type Context, type Rule, type Violation } from "../types.ts";

// Runs in a separate Node process, so project code never runs inside the conformance script.
const LOADER = `
const m = await import(process.argv[1]);
const out = { error: null, profiles: null, results: [] };
const profiles = m.profiles;
const schema = m.profileSchema;
if (!profiles || typeof profiles !== "object") out.error = "profiles.ts must export \`profiles\`, an object of named profiles";
else if (!schema || typeof schema.safeParse !== "function") out.error = "profiles.ts must export \`profileSchema\` with a safeParse() method";
else {
  out.profiles = profiles;
  for (const [name, p] of Object.entries(profiles)) {
    const r = schema.safeParse(p);
    const issues = r && r.success ? [] : ((r && r.error && r.error.issues) || []).map((i) => (i.path || []).join(".") + ": " + i.message);
    out.results.push({ name, ok: !!(r && r.success), issues });
  }
}
process.stdout.write(JSON.stringify(out));
`;

export type Profile = { env?: unknown; adapters?: Record<string, unknown>; allowedHosts?: unknown };
export type Loaded = {
  file: string;
  error: string | null;
  profiles: Record<string, Profile> | null;
  results: Array<{ name: string; ok: boolean; issues: string[] }>;
  lineOf(name: string): number;
};

const cache = new Map<string, Loaded>();

/** Loads src/config/profiles.ts in a child process. Cached per project root and file content. */
export function loadProfiles(ctx: Context): Loaded {
  const file = `${ctx.config.folders.config}/profiles.ts`;
  const text = ctx.read(file) ?? "";
  const key = `${ctx.root}\0${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const lines = text.split("\n");
  const lineOf = (name: string): number => {
    const re = new RegExp(`^\\s*["']?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']?\\s*:`);
    const i = lines.findIndex((l) => re.test(l));
    return i >= 0 ? i + 1 : 0;
  };
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", LOADER, pathToFileURL(join(ctx.root, file)).href], {
    cwd: ctx.root,
    encoding: "utf8",
    timeout: 30_000,
  });
  let loaded: Loaded;
  if (r.status !== 0) {
    const reason = (r.stderr || r.error?.message || "unknown error").split("\n").find((l) => /Error/.test(l)) ?? "failed to load";
    loaded = { file, error: `could not load ${file}: ${reason.trim()}`, profiles: null, results: [], lineOf };
  } else {
    const parsed = JSON.parse(r.stdout) as Omit<Loaded, "file" | "lineOf">;
    loaded = { file, ...parsed, lineOf };
  }
  cache.set(key, loaded);
  return loaded;
}

export const R23: Rule = {
  id: "R23",
  name: "profile-valid",
  severity: "error",
  needs: ["profiles"],
  scope: "project",
  check(ctx) {
    const p = loadProfiles(ctx);
    if (p.error) return [violation(R23, p.file, 0, p.error)];
    const out: Violation[] = [];
    for (const r of p.results) {
      if (!r.ok) out.push(violation(R23, p.file, p.lineOf(r.name), `profile "${r.name}" does not match profileSchema: ${r.issues.join("; ") || "invalid"}`));
    }
    return out;
  },
};
