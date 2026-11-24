// Shared by the auth adapters. Passwords use scrypt with a random salt; tokens are random and stored as SHA-256.

import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEYLEN = 64;
const PARAMS = { N: 16384, r: 8, p: 1 };

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEYLEN, PARAMS, (e, key) => (e ? reject(e) : resolve(key)));
  });
}

/** Stored form: scrypt:1:<saltBase64url>:<hashBase64url>. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt:1:${salt.toString("base64url")}:${key.toString("base64url")}`;
}

/** False for a wrong password and for a malformed stored value. Rejects only if scrypt itself fails. */
export async function checkPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== "scrypt" || parts[1] !== "1") return false;
  const salt = Buffer.from(parts[2] ?? "", "base64url");
  const expected = Buffer.from(parts[3] ?? "", "base64url");
  if (salt.length === 0 || expected.length !== KEYLEN) return false;
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, expected);
}

/** A well-formed hash nobody knows the password of. Checked when the email is unknown, so the time matches. */
export const DUMMY_HASH = `scrypt:1:${Buffer.alloc(16, 7).toString("base64url")}:${Buffer.alloc(KEYLEN, 9).toString("base64url")}`;

/** 32 random bytes, base64url. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
