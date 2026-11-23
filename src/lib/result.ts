// Result and StepError: the one shape every step returns (plan section 4).
// A failure is never a value: errors are a separate shape that carries the step, the strip run, and an audience.

export type ErrorKind =
  | "validation"
  | "not_found"
  | "conflict"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "network"
  | "upstream"
  | "unexpected";

type StepErrorBase = {
  kind: ErrorKind;
  /** Step name, an explicit string that survives minification. */
  step: string;
  stripId: string;
  /** For logs only. Never shown to users. */
  message: string;
  retryable: boolean;
  /** For logs only. Stored as a non-enumerable property, so JSON.stringify, spreads and Server Actions never carry it. */
  cause?: unknown;
};

/** `userMessage` is required exactly when `audience` is "user". */
export type StepError =
  | (StepErrorBase & { audience: "internal"; userMessage?: undefined })
  | (StepErrorBase & { audience: "user"; userMessage: string });

export type Result<T> = { ok: true; value: T } | { ok: false; error: StepError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const err = (error: StepError): Result<never> => ({ ok: false, error });

export type ErrorOptions =
  | { audience?: "internal"; retryable?: boolean; cause?: unknown }
  | { audience: "user"; userMessage: string; retryable?: boolean; cause?: unknown };

/** Builds a StepError. Audience defaults to "internal". */
export function makeError(
  kind: ErrorKind,
  step: string,
  stripId: string,
  message: string,
  options: ErrorOptions = {},
): StepError {
  const base = { kind, step, stripId, message, retryable: options.retryable ?? false };
  const built: StepError =
    options.audience === "user"
      ? { ...base, audience: "user", userMessage: options.userMessage }
      : { ...base, audience: "internal" };
  if (options.cause !== undefined) {
    Object.defineProperty(built, "cause", { value: options.cause, enumerable: false, writable: true, configurable: true });
  }
  return built;
}

/**
 * A plain object a step may throw to report an expected failure kind from deep inside its code.
 * The step wrapper turns it into a StepError and keeps `kind`.
 */
export type TypedError = {
  readonly __typedError: true;
  kind: ErrorKind;
  message: string;
  retryable: boolean;
  audience: "internal" | "user";
  userMessage?: string;
};

export function typedError(kind: ErrorKind, message: string, options: ErrorOptions = {}): TypedError {
  const base = { __typedError: true as const, kind, message, retryable: options.retryable ?? false };
  if (options.audience === "user") return { ...base, audience: "user", userMessage: options.userMessage };
  return { ...base, audience: "internal" };
}

export function isTypedError(thrown: unknown): thrown is TypedError {
  return (
    typeof thrown === "object" &&
    thrown !== null &&
    (thrown as { __typedError?: unknown }).__typedError === true &&
    typeof (thrown as { kind?: unknown }).kind === "string"
  );
}

function describe(thrown: unknown): string {
  if (thrown instanceof Error) return thrown.message;
  if (typeof thrown === "string") return thrown;
  try {
    return JSON.stringify(thrown) ?? String(thrown);
  } catch {
    return "unserializable thrown value";
  }
}

/**
 * Converts anything a step threw into a StepError. A TypedError keeps its kind and audience.
 * Anything else becomes kind "unexpected", audience "internal", and its text goes to `message` (logs) only,
 * never to `userMessage`.
 */
export function fromThrown(thrown: unknown, step: string, stripId: string): StepError {
  if (isTypedError(thrown)) {
    if (thrown.audience === "user" && typeof thrown.userMessage === "string" && thrown.userMessage !== "") {
      return makeError(thrown.kind, step, stripId, thrown.message, {
        audience: "user",
        userMessage: thrown.userMessage,
        retryable: thrown.retryable,
      });
    }
    return makeError(thrown.kind, step, stripId, thrown.message, { retryable: thrown.retryable });
  }
  return makeError("unexpected", step, stripId, describe(thrown), { cause: thrown });
}
