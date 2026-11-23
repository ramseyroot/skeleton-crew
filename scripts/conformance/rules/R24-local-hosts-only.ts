import { loadProfiles } from "./R23-profile-valid.ts";
import { violation, type Rule } from "../types.ts";

const LOCAL = new Set(["localhost", "127.0.0.1", "::1"]);

export const R24: Rule = {
  id: "R24",
  name: "local-hosts-only",
  severity: "error",
  needs: ["profiles"],
  scope: "project",
  check(ctx) {
    const p = loadProfiles(ctx);
    if (p.error || !p.profiles) return []; // reported by R23
    const local = p.profiles.local;
    if (!local) return [violation(R24, p.file, 0, `no "local" profile. Every app needs one that runs offline`)];
    const hosts = Array.isArray(local.allowedHosts) ? local.allowedHosts.map(String) : [];
    const outside = hosts.filter((h) => !LOCAL.has(h));
    return outside.length === 0
      ? []
      : [violation(R24, p.file, p.lineOf("local"), `the local profile allows non-local hosts: ${outside.join(", ")}. Local must run offline`)];
  },
};
