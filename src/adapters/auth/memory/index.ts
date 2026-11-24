import { portError } from "../../../lib/port-error.ts";
import type { Role } from "../../../lib/principal.ts";
import { err, ok } from "../../../lib/result.ts";
import type { Result } from "../../../lib/result.ts";
import { SESSION_TTL_DEFAULT_MS, validateCredentials } from "../../../ports/auth.ts";
import type { Account, Auth, SessionToken } from "../../../ports/auth.ts";
import type { Clock } from "../../../ports/clock.ts";
import type { IdGenerator } from "../../../ports/ids.ts";
import { checkPassword, DUMMY_HASH, hashPassword, newToken, sha256Hex } from "../hashing.ts";
import { errorMap } from "./errors.ts";

const NAME = "memory";
const ADAPTER = `auth/${NAME}`;

export type MemoryAuthOptions = { clock: Clock; ids: IdGenerator; sessionTtlMs?: number };

type AccountRow = Account & { passwordHash: string };
type SessionRow = { accountId: string; expiresAt: string };

const userError = (kind: "validation" | "conflict" | "unauthorized", message: string, userMessage: string) =>
  err(portError(kind, ADAPTER, message, { audience: "user", userMessage }));

const wrongLogin = () => userError("unauthorized", "invalid credentials", "Email or password is wrong.");
const signInAgain = () => userError("unauthorized", "no valid session", "Please sign in again.");
const duplicate = () => userError("conflict", "email already registered", "An account with that email already exists.");

export function createMemoryAuth(options: MemoryAuthOptions): Auth {
  const { clock, ids } = options;
  const ttl = options.sessionTtlMs ?? SESSION_TTL_DEFAULT_MS;
  const accounts = new Map<string, AccountRow>();
  const byEmail = new Map<string, string>();
  const sessions = new Map<string, SessionRow>(); // key: token hash

  const publicAccount = (a: AccountRow): Account => ({ id: a.id, email: a.email, role: a.role, createdAt: a.createdAt });

  async function guard<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
    try {
      return await fn();
    } catch (thrown) {
      return err(portError(errorMap.map(thrown), ADAPTER, "auth operation failed", { cause: thrown }));
    }
  }

  return {
    name: NAME,

    createAccount: (input) =>
      guard(async () => {
        const valid = validateCredentials(input.email, input.password);
        if (!valid.ok) return userError("validation", "invalid credentials input", valid.userMessage);
        const email = input.email.toLowerCase();
        if (byEmail.has(email)) return duplicate();
        const passwordHash = await hashPassword(input.password);
        if (byEmail.has(email)) return duplicate();
        const role: Role = input.role ?? "user";
        const row: AccountRow = { id: ids.next(), email, role, createdAt: clock.now(), passwordHash };
        accounts.set(row.id, row);
        byEmail.set(email, row.id);
        return ok(publicAccount(row));
      }),

    verifyPassword: (email, password) =>
      guard(async () => {
        const id = typeof email === "string" ? byEmail.get(email.toLowerCase()) : undefined;
        const row = id === undefined ? undefined : accounts.get(id);
        const good = await checkPassword(typeof password === "string" ? password : "", row?.passwordHash ?? DUMMY_HASH);
        if (!row || !good) return wrongLogin();
        return ok(publicAccount(row));
      }),

    getAccount: (accountId) =>
      guard(async () => {
        const row = accounts.get(accountId);
        if (!row) return err(portError("not_found", ADAPTER, "account not found"));
        return ok(publicAccount(row));
      }),

    createSession: (accountId) =>
      guard(async (): Promise<Result<SessionToken>> => {
        if (!accounts.has(accountId)) return err(portError("not_found", ADAPTER, "account not found"));
        const token = newToken();
        const expiresAt = new Date(Date.parse(clock.now()) + ttl).toISOString();
        sessions.set(sha256Hex(token), { accountId, expiresAt });
        return ok({ token, expiresAt });
      }),

    verifySession: (token) =>
      guard(async () => {
        const key = sha256Hex(String(token));
        const session = sessions.get(key);
        if (!session) return signInAgain();
        if (Date.parse(session.expiresAt) <= Date.parse(clock.now())) {
          sessions.delete(key);
          return signInAgain();
        }
        const row = accounts.get(session.accountId);
        if (!row) return signInAgain();
        return ok(publicAccount(row));
      }),

    endSession: (token) =>
      guard(async () => {
        sessions.delete(sha256Hex(String(token)));
        return ok(undefined);
      }),

    endAllSessions: (accountId) =>
      guard(async () => {
        for (const [key, s] of sessions) if (s.accountId === accountId) sessions.delete(key);
        return ok(undefined);
      }),
  };
}
