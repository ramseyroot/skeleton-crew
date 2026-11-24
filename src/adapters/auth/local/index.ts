import { portError } from "../../../lib/port-error.ts";
import type { Role } from "../../../lib/principal.ts";
import { err, ok } from "../../../lib/result.ts";
import type { Result } from "../../../lib/result.ts";
import { AUTH_COLLECTIONS, SESSION_TTL_DEFAULT_MS, validateCredentials } from "../../../ports/auth.ts";
import type { Account, Auth, SessionToken } from "../../../ports/auth.ts";
import type { Clock } from "../../../ports/clock.ts";
import type { Database, DbRecord } from "../../../ports/database.ts";
import type { IdGenerator } from "../../../ports/ids.ts";
import { checkPassword, DUMMY_HASH, hashPassword, newToken, sha256Hex } from "../hashing.ts";
import { errorMap } from "./errors.ts";

const NAME = "local";
const ADAPTER = `auth/${NAME}`;

export type LocalAuthOptions = { database: Database; clock: Clock; ids: IdGenerator; sessionTtlMs?: number };

const userError = (kind: "validation" | "conflict" | "unauthorized", message: string, userMessage: string) =>
  err(portError(kind, ADAPTER, message, { audience: "user", userMessage }));

const wrongLogin = () => userError("unauthorized", "invalid credentials", "Email or password is wrong.");
const signInAgain = () => userError("unauthorized", "no valid session", "Please sign in again.");
const duplicate = () => userError("conflict", "email already registered", "An account with that email already exists.");

function toAccount(r: DbRecord): Account {
  return { id: r.id, email: String(r.email), role: r.role as Role, createdAt: r.createdAt };
}

export function createLocalAuth(options: LocalAuthOptions): Auth {
  const { database, clock, ids } = options;
  const ttl = options.sessionTtlMs ?? SESSION_TTL_DEFAULT_MS;
  const accounts = database.read("accounts");
  const accountsW = database.write("accounts");
  const sessions = database.read("sessions");
  const sessionsW = database.write("sessions");

  let migrated: Promise<Result<void>> | null = null;
  function ready(): Promise<Result<void>> {
    migrated ??= database.migrate(AUTH_COLLECTIONS).then((res) => {
      if (!res.ok) migrated = null; // try again on the next call
      return res;
    });
    return migrated;
  }

  async function guard<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
    try {
      const m = await ready();
      if (!m.ok) return m;
      return await fn();
    } catch (thrown) {
      migrated = null;
      return err(portError(errorMap.map(thrown), ADAPTER, "auth operation failed", { cause: thrown }));
    }
  }

  async function accountByEmail(email: string): Promise<Result<DbRecord | null>> {
    const found = await accounts.findBy("email", email);
    if (!found.ok) return found;
    return ok(found.value[0] ?? null);
  }

  return {
    name: NAME,

    createAccount: (input) =>
      guard(async () => {
        const valid = validateCredentials(input.email, input.password);
        if (!valid.ok) return userError("validation", "invalid credentials input", valid.userMessage);
        const email = input.email.toLowerCase();
        const existing = await accountByEmail(email);
        if (!existing.ok) return existing;
        if (existing.value) return duplicate();
        const passwordHash = await hashPassword(input.password);
        const created = await accountsW.create({
          id: ids.next(),
          email,
          passwordHash,
          role: input.role ?? "user",
        });
        if (!created.ok) return created.error.kind === "conflict" ? duplicate() : created;
        return ok(toAccount(created.value));
      }),

    verifyPassword: (email, password) =>
      guard(async () => {
        const found = await accountByEmail(typeof email === "string" ? email.toLowerCase() : "");
        if (!found.ok) return found;
        const row = found.value;
        const stored = row && typeof row.passwordHash === "string" ? row.passwordHash : DUMMY_HASH;
        const good = await checkPassword(typeof password === "string" ? password : "", stored);
        if (!row || !good) return wrongLogin();
        return ok(toAccount(row));
      }),

    getAccount: (accountId) =>
      guard(async () => {
        const res = await accounts.get(accountId);
        if (!res.ok) return res;
        if (!res.value) return err(portError("not_found", ADAPTER, "account not found"));
        return ok(toAccount(res.value));
      }),

    createSession: (accountId) =>
      guard(async (): Promise<Result<SessionToken>> => {
        const acc = await accounts.get(accountId);
        if (!acc.ok) return acc;
        if (!acc.value) return err(portError("not_found", ADAPTER, "account not found"));
        const token = newToken();
        const expiresAt = new Date(Date.parse(clock.now()) + ttl).toISOString();
        const created = await sessionsW.create({ id: ids.next(), accountId, tokenHash: sha256Hex(token), expiresAt });
        if (!created.ok) return created;
        return ok({ token, expiresAt });
      }),

    verifySession: (token) =>
      guard(async () => {
        const found = await sessions.findBy("tokenHash", sha256Hex(String(token)));
        if (!found.ok) return found;
        const session = found.value[0];
        if (!session) return signInAgain();
        if (Date.parse(String(session.expiresAt)) <= Date.parse(clock.now())) {
          const del = await sessionsW.delete(session.id);
          if (!del.ok && del.error.kind !== "not_found") return del;
          return signInAgain();
        }
        const acc = await accounts.get(String(session.accountId));
        if (!acc.ok) return acc;
        if (!acc.value) return signInAgain();
        return ok(toAccount(acc.value));
      }),

    endSession: (token) =>
      guard(async () => {
        const found = await sessions.findBy("tokenHash", sha256Hex(String(token)));
        if (!found.ok) return found;
        const session = found.value[0];
        if (!session) return ok(undefined);
        const del = await sessionsW.delete(session.id);
        if (!del.ok && del.error.kind !== "not_found") return del;
        return ok(undefined);
      }),

    endAllSessions: (accountId) =>
      guard(async () => {
        const found = await sessions.findBy("accountId", accountId);
        if (!found.ok) return found;
        return database.batch(found.value.map((s) => ({ op: "delete" as const, collection: "sessions", id: s.id })));
      }),
  };
}
