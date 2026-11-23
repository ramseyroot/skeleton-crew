export const profileSchema = {
  safeParse(p: any) {
    const issues: Array<{ path: string[]; message: string }> = [];
    if (typeof p?.env !== "string") issues.push({ path: ["env"], message: "required" });
    if (!Array.isArray(p?.allowedHosts)) issues.push({ path: ["allowedHosts"], message: "must be a list" });
    return issues.length ? { success: false, error: { issues } } : { success: true };
  },
};
export const profiles = {
  local: { env: "local", adapters: {}, allowedHosts: ["localhost"] },
  dev: { env: "dev", adapters: {}, allowedHosts: ["dev.example.com"] },
};
