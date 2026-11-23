// Typed fixtures for tests and Storybook, so a story builds the same StripResult a strip would return.

import { makeError } from "../lib/result.ts";
import type { ErrorKind } from "../lib/result.ts";
import type { StripResult } from "../lib/strip.ts";

export function okResult<T>(value: T, stripId = "strip-demo"): StripResult<T> {
  return { ok: true, value, stripId };
}

/**
 * A failed result. A `user` error shows `userMessage` as a toast. An `internal` error shows the generic
 * message with the stripId as its reference, like the runner does.
 */
export function errResult(
  kind: ErrorKind,
  audience: "user" | "internal",
  options: { userMessage?: string; stripId?: string; step?: string } = {},
): StripResult<never> {
  const stripId = options.stripId ?? "strip-demo";
  const step = options.step ?? "db.user.setDisplayName";
  if (audience === "user") {
    const userMessage = options.userMessage ?? "That did not work. Please check your input.";
    return {
      ok: false,
      error: makeError(kind, step, stripId, `fixture ${kind} error`, { audience: "user", userMessage }),
      display: { type: "toast", message: userMessage },
      stripId,
    };
  }
  return {
    ok: false,
    error: makeError(kind, step, stripId, `fixture ${kind} error`),
    display: { type: "generic", reference: stripId },
    stripId,
  };
}
