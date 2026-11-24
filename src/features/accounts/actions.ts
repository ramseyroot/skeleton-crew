"use server";

import { cookies } from "next/headers.js";
import { redirect } from "next/navigation.js";
import { getRuntime } from "../../app/runtime.ts";
import { runStrip } from "../../lib/strip.ts";
import type { PublicResult } from "../../shared/ui/view-state.ts";
import { SESSION_COOKIE } from "./domain.ts";
import type { AccountView } from "./domain.ts";
import { sessionCookieOptions, signIn } from "./session.ts";
import { logout } from "./strips/accounts.logout.strip.ts";

const text = (value: FormDataEntryValue | null): string => (typeof value === "string" ? value : "");

async function submit(mode: "login" | "signup", formData: FormData): Promise<PublicResult<AccountView>> {
  const runtime = await getRuntime();
  const outcome = await signIn(runtime.ports, mode, { email: text(formData.get("email")), password: text(formData.get("password")) });
  if (!outcome.session) return outcome.result;
  (await cookies()).set(SESSION_COOKIE, outcome.session.token, sessionCookieOptions(runtime.profile.env, outcome.session.expiresAt));
  redirect("/");
}

/** The login form's Server Action. Returns a PublicResult on failure, and redirects on success. */
export async function loginAction(_previous: PublicResult<AccountView> | null, formData: FormData): Promise<PublicResult<AccountView>> {
  return submit("login", formData);
}

/** The sign-up form's Server Action. Returns a PublicResult on failure, and redirects on success. */
export async function signupAction(_previous: PublicResult<AccountView> | null, formData: FormData): Promise<PublicResult<AccountView>> {
  return submit("signup", formData);
}

/** Ends the session and removes the cookie. */
export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const runtime = await getRuntime();
    await runStrip(logout, runtime.ports, { token });
  }
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
