// Profiles: named sets of adapter choices and settings (docs/environments.md).
// The active profile comes from APP_ENV and is validated at startup (config/compose.ts).
//
// This file is loaded on its own by the conformance checker (R23), so it imports only zod and no app code.
//
// The skeleton can only name adapters that exist. `dev` and `prod` therefore reuse the local-capable adapters
// (sqlite, fs) with paths that must come from environment variables, so they can never silently share the
// local files. An app replaces them with its own adapters (PocketBase, Supabase, R2, ...) when it has them.

import { z } from "zod";

const ENVS = ["local", "dev", "prod"] as const;

export const profileSchema = z
  .object({
    env: z.enum(ENVS),
    adapters: z
      .object({
        logger: z.enum(["console", "memory"]),
        clock: z.enum(["system", "fixed"]),
        ids: z.enum(["uuid", "sequence"]),
        database: z.enum(["memory", "sqlite"]),
        cache: z.enum(["memory", "null"]),
        storage: z.enum(["memory", "fs"]),
      })
      .strict(),
    /** Hosts this profile may reach. Every adapter declares the hosts it reaches, and each must be in this list. */
    allowedHosts: z.array(z.string().min(1)),
    /** Where file-based adapters keep data. When missing, the path comes from DATABASE_PATH and STORAGE_PATH. */
    paths: z
      .object({
        database: z.string().min(1).optional(),
        storage: z.string().min(1).optional(),
      })
      .strict(),
    logFormat: z.enum(["json", "pretty"]),
  })
  .strict()
  .superRefine((profile, ctx) => {
    if (profile.env !== "local") {
      if (profile.adapters.clock !== "system") {
        ctx.addIssue({ code: "custom", path: ["adapters", "clock"], message: `${profile.env} must use the system clock` });
      }
      if (profile.adapters.ids !== "uuid") {
        ctx.addIssue({ code: "custom", path: ["adapters", "ids"], message: `${profile.env} must use uuid ids` });
      }
    }
    if (profile.env === "prod") {
      for (const port of ["database", "storage"] as const) {
        if (profile.adapters[port] === "memory") {
          ctx.addIssue({ code: "custom", path: ["adapters", port], message: "prod must not keep data in memory" });
        }
      }
    }
  });

export type Profile = z.infer<typeof profileSchema>;
export type ProfileName = (typeof ENVS)[number];

export const profiles = {
  local: {
    env: "local",
    adapters: { logger: "console", clock: "system", ids: "uuid", database: "sqlite", cache: "memory", storage: "fs" },
    allowedHosts: ["localhost", "127.0.0.1"],
    paths: { database: ".data/local/app.db", storage: ".data/local/files" },
    logFormat: "pretty",
  },
  dev: {
    env: "dev",
    adapters: { logger: "console", clock: "system", ids: "uuid", database: "sqlite", cache: "memory", storage: "fs" },
    allowedHosts: [],
    paths: {},
    logFormat: "json",
  },
  prod: {
    env: "prod",
    adapters: { logger: "console", clock: "system", ids: "uuid", database: "sqlite", cache: "null", storage: "fs" },
    allowedHosts: [],
    paths: {},
    logFormat: "json",
  },
} as const satisfies Record<ProfileName, unknown>;

/**
 * Problems that involve more than one profile. `profileSchema` checks each profile alone.
 * Returns readable messages, empty when everything is consistent.
 */
export function crossProfileProblems(all: Record<string, Profile>): string[] {
  const problems: string[] = [];
  const local = all.local;
  if (local) {
    const outside = local.allowedHosts.filter((h) => !["localhost", "127.0.0.1", "::1"].includes(h));
    if (outside.length > 0) problems.push(`profile local may only allow local hosts, but lists: ${outside.join(", ")}`);
  }
  const prod = all.prod;
  if (prod) {
    for (const name of Object.keys(all)) {
      if (name === "prod") continue;
      const shared = (all[name]?.allowedHosts ?? []).filter((h) => prod.allowedHosts.includes(h));
      if (shared.length > 0) problems.push(`profile ${name} lists production host(s): ${shared.join(", ")}`);
    }
  }
  const seen = new Map<string, string>();
  for (const [name, p] of Object.entries(all)) {
    for (const kind of ["database", "storage"] as const) {
      const path = p.paths[kind];
      if (path === undefined) continue;
      const other = seen.get(`${kind}:${path}`);
      if (other !== undefined) problems.push(`profiles ${other} and ${name} share the ${kind} path ${path}`);
      else seen.set(`${kind}:${path}`, name);
    }
  }
  return problems;
}
