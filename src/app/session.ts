// Who is looking at a page: reads the session cookie and asks the Auth port. Server only.
// It uses the Auth port, not a feature, so it keeps working when a feature is switched off.

import { cookies } from "next/headers.js";
import type { Principal } from "../lib/principal.ts";
import { SESSION_COOKIE } from "../shared/session.ts";
import { getRuntime } from "./runtime.ts";

/** The signed-in user, or an anonymous principal. A failed lookup also gives anonymous: the page then asks to sign in. */
export async function currentPrincipal(): Promise<Principal> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return { kind: "anonymous", ip: "page" };
  const runtime = await getRuntime();
  const account = await runtime.ports.auth.verifySession(token);
  if (!account.ok) return { kind: "anonymous", ip: "page" };
  return { kind: "user", accountId: account.value.id, role: account.value.role };
}
