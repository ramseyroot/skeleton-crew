// Key generation and hashing. A plain helper, not a step: it has no permissions and no failure modes.
// A key is `sk_<prefix>_<secret>`: 8 and 48 letters and digits, made from the IdGenerator port so tests are deterministic.

import { createHash } from "node:crypto";
import type { IdGenerator } from "../../ports/ids.ts";

export const PREFIX_LENGTH = 8;
export const SECRET_LENGTH = 48;
export const KEY_PATTERN = /^sk_([A-Za-z0-9]{8})_([A-Za-z0-9]{48})$/;

export function generateKey(ids: IdGenerator): { prefix: string; key: string } {
  let chars = "";
  while (chars.length < PREFIX_LENGTH + SECRET_LENGTH) chars += ids.next().replace(/[^A-Za-z0-9]/g, "");
  const prefix = chars.slice(0, PREFIX_LENGTH);
  const secret = chars.slice(PREFIX_LENGTH, PREFIX_LENGTH + SECRET_LENGTH);
  return { prefix, key: `sk_${prefix}_${secret}` };
}

/** SHA-256 of the whole key, as hex. */
export const hashKey = (key: string): string => createHash("sha256").update(key).digest("hex");

/** The prefix of a well-formed key, or null. */
export const prefixOf = (key: string): string | null => KEY_PATTERN.exec(key)?.[1] ?? null;
