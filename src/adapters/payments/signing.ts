// Shared by the payment adapters: signing and checking webhook bodies.

import { createHmac, timingSafeEqual } from "node:crypto";

export const hmacSha512Hex = (secret: string, body: string): string => createHmac("sha512", secret).update(body).digest("hex");

/** Constant-time comparison of two hex strings. A different length is simply false. */
export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Case-insensitive header lookup. */
export function header(headers: Record<string, string>, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === wanted) return v;
  return undefined;
}
