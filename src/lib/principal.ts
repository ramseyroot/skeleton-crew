// Who is making a request (platform parts design, section 4).

export type Role = "user" | "admin";

export type Principal =
  | { kind: "user"; accountId: string; role: Role }
  | { kind: "key"; accountId: string; keyId: string; role: Role }
  | { kind: "anonymous"; ip: string };

export type SignedIn = Exclude<Principal, { kind: "anonymous" }>;

export const isSignedIn = (p: Principal): p is SignedIn => p.kind !== "anonymous";

/** A stable text for counting: "key:<id>", "user:<id>" or "ip:<address>". Never contains a secret. */
export function principalKey(p: Principal): string {
  if (p.kind === "key") return `key:${p.keyId}`;
  if (p.kind === "user") return `user:${p.accountId}`;
  return `ip:${p.ip}`;
}
