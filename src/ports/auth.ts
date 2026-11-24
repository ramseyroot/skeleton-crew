// Auth port. Accounts with an email and a password, and sessions identified by a secret token.
//
// Semantics (every adapter behaves the same, and the contract suite checks each line):
// - Credentials: `validateCredentials` accepts an email with exactly one "@", at least one "." after it, no
//   spaces, and at most 254 characters, and a password of 10 to 200 characters. On failure the adapter returns
//   a `validation` error with audience "user" and a written userMessage, for example
//   "Enter a valid email address." or "Use at least 10 characters for your password.".
// - createAccount: `role` defaults to "user". Emails are unique ignoring case and are returned lowercased. A
//   duplicate is `conflict` (audience user, "An account with that email already exists."). The password is
//   never stored, returned, logged or included in any error text. Only a salted scrypt hash is stored.
// - verifyPassword: a wrong password and an unknown email return the IDENTICAL error: kind `unauthorized`, same
//   message, audience user, userMessage "Email or password is wrong.". For an unknown email one full scrypt
//   still runs against a fixed dummy hash, so the time is similar.
// - getAccount: an unknown id is `not_found`.
// - createSession: returns { token, expiresAt }. The token is 32 random bytes in base64url and is returned
//   ONCE. Only its SHA-256 hex is stored. A session lasts 7 days from the clock (factory option sessionTtlMs).
//   An unknown account is `not_found`.
// - verifySession: an unknown, ended or expired token is `unauthorized` (audience user, "Please sign in
//   again."). Otherwise it returns the account. An expired session is deleted when seen.
// - endSession: ends one session. An unknown token succeeds. endAllSessions removes every session of the
//   account in one atomic batch.
// - Nothing throws out of a port method. Unexpected failures come back as Result errors.
//
// Adapters: local (accounts and sessions kept through the Database port), memory.
// Planned adapters (not built): PocketBase auth, Supabase auth (an app on those platforms uses their login).

import type { Role } from "../lib/principal.ts";
import type { Result } from "../lib/result.ts";
import type { CollectionDef } from "./database.ts";

export type Account = { id: string; email: string; role: Role; createdAt: string };
export type SessionToken = { token: string; expiresAt: string };

export interface Auth {
  readonly name: string;
  createAccount(input: { email: string; password: string; role?: Role }): Promise<Result<Account>>;
  verifyPassword(email: string, password: string): Promise<Result<Account>>;
  getAccount(accountId: string): Promise<Result<Account>>;
  createSession(accountId: string): Promise<Result<SessionToken>>;
  verifySession(token: string): Promise<Result<Account>>;
  endSession(token: string): Promise<Result<void>>;
  endAllSessions(accountId: string): Promise<Result<void>>;
}

/** The collections the local adapter keeps through the Database port. */
export const AUTH_COLLECTIONS: CollectionDef[] = [
  {
    name: "accounts",
    fields: {
      email: { type: "string", unique: true, normalize: "lower" },
      passwordHash: { type: "string" },
      role: { type: "string" },
    },
  },
  {
    name: "sessions",
    fields: {
      accountId: { type: "string", indexed: true },
      tokenHash: { type: "string", unique: true },
      expiresAt: { type: "string" },
    },
  },
];

export const SESSION_TTL_DEFAULT_MS = 7 * 24 * 60 * 60 * 1000;

export function validateCredentials(email: string, password: string): { ok: true } | { ok: false; userMessage: string } {
  const at = typeof email === "string" ? email.indexOf("@") : -1;
  const emailOk =
    typeof email === "string" &&
    email.length <= 254 &&
    !/\s/.test(email) &&
    at > 0 &&
    at === email.lastIndexOf("@") &&
    email.indexOf(".", at + 1) > at + 1 &&
    !email.endsWith(".");
  if (!emailOk) return { ok: false, userMessage: "Enter a valid email address." };
  if (typeof password !== "string" || password.length < 10) {
    return { ok: false, userMessage: "Use at least 10 characters for your password." };
  }
  if (password.length > 200) return { ok: false, userMessage: "Use at most 200 characters for your password." };
  return { ok: true };
}
