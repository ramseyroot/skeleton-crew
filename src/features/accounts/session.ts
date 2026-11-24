// What happens between a form and a cookie, without Next.js, so tests can run it: run the strips, and say
// which cookie to set. The Server Actions in `actions.ts` only add the cookie and the redirect.

import { runStrip } from "../../lib/strip.ts";
import type { Ports } from "../../lib/step.ts";
import { toPublicResult } from "../../shared/ui/view-state.ts";
import type { PublicResult } from "../../shared/ui/view-state.ts";
import type { AccountView } from "./domain.ts";
import { login } from "./strips/accounts.login.strip.ts";
import { signup } from "./strips/accounts.signup.strip.ts";
import { start } from "./strips/accounts.start.strip.ts";

export type SignInOutcome = {
  /** What the browser may see. */
  result: PublicResult<AccountView>;
  /** Present only on success. The token never leaves the server except in the cookie. */
  session?: { token: string; expiresAt: string };
};

/** Signs up or logs in, then starts a session. A failure in either strip is returned as a public result. */
export async function signIn(
  ports: Ports,
  mode: "login" | "signup",
  form: { email: string; password: string },
): Promise<SignInOutcome> {
  const checked = mode === "signup" ? await runStrip(signup, ports, form) : await runStrip(login, ports, form);
  if (!checked.ok) return { result: toPublicResult(checked) };
  const started = await runStrip(start, ports, { accountId: checked.value.id });
  if (!started.ok) return { result: toPublicResult(started) };
  return { result: toPublicResult(checked), session: started.value };
}

export type CookieOptions = { httpOnly: true; sameSite: "lax"; secure: boolean; path: "/"; expires: Date };

/** HttpOnly so scripts cannot read it, SameSite=Lax, and Secure everywhere except the local profile (plain http). */
export function sessionCookieOptions(env: string, expiresAt: string): CookieOptions {
  return { httpOnly: true, sameSite: "lax", secure: env !== "local", path: "/", expires: new Date(expiresAt) };
}
