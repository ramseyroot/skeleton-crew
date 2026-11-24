// The API pipeline (platform parts design, section 4). Every API endpoint goes through one function:
//
//   request id, who is calling, per-minute limit, monthly quota, plan entitlement, the endpoint's strip, response,
//   then metering.
//
// It uses only the web-standard Request and Response, so it runs in plain Node tests and in Next.js route handlers.
// It imports no feature: the app gives it the pieces (`ApiDeps`) built from the features' strips.
//
// Errors always have one shape: { "error": { "code", "message", "request_id" } }. The message of an internal error is
// never sent. A user error sends the message its step wrote. `x-request-id` is the strip's reference, so a support
// request can be traced to one strip run.

import type { Principal } from "./principal.ts";
import { isSignedIn, principalKey } from "./principal.ts";
import { makeError } from "./result.ts";
import type { ErrorKind, Result, StepError } from "./result.ts";
import type { Ports } from "./step.ts";
import { runStrip } from "./strip.ts";
import type { Strip } from "./strip.ts";

// ---- one place for status codes and messages --------------------------------

const STATUS: Record<ErrorKind, number> = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  upstream: 502,
  network: 503,
  unexpected: 500,
};

export const statusOf = (kind: ErrorKind): number => STATUS[kind];

const GENERIC: Record<ErrorKind, string> = {
  validation: "The request was not valid.",
  unauthorized: "You need to sign in, or send a valid API key.",
  forbidden: "You do not have access to this.",
  not_found: "Not found.",
  conflict: "That conflicts with the current state.",
  rate_limited: "Too many requests. Try again later.",
  upstream: "A service we depend on failed. Try again later.",
  network: "A service we depend on is unreachable. Try again later.",
  unexpected: "Something went wrong on our side.",
};

/** The text a client sees: the written message of a user error, otherwise a fixed sentence for the kind. */
export function publicMessage(error: StepError): string {
  return error.audience === "user" ? error.userMessage : GENERIC[error.kind];
}

export type ErrorBody = { error: { code: ErrorKind; message: string; request_id: string } };

export function errorBody(code: ErrorKind, message: string, requestId: string): ErrorBody {
  return { error: { code, message, request_id: requestId } };
}

// ---- rate limit headers ------------------------------------------------------

export type Allowance = { allowed: boolean; limit: number; remaining: number; resetAt: string; retryAfterSeconds: number };
export type Rule = { limit: number; windowMs: number };

export function rateLimitHeaders(a: Allowance, now: string): Record<string, string> {
  const resetSeconds = Math.max(0, Math.ceil((Date.parse(a.resetAt) - Date.parse(now)) / 1000));
  const headers: Record<string, string> = {
    "ratelimit-limit": String(a.limit),
    "ratelimit-remaining": String(Math.max(0, a.remaining)),
    "ratelimit-reset": String(resetSeconds),
  };
  if (!a.allowed) headers["retry-after"] = String(Math.max(1, a.retryAfterSeconds));
  return headers;
}

// ---- the pipeline ------------------------------------------------------------

export type AuthMode = "key" | "session" | "either" | "none";

export type Limits = { perMinute: number; perMonth: number; features: string[] };

export type ApiDeps = {
  ports: () => Promise<Ports>;
  /** Reads the key or the session from the request. A failure is `unauthorized`. */
  authenticate(request: Request, ports: Ports, mode: Exclude<AuthMode, "none">): Promise<Result<Principal>>;
  limitsFor(principal: Principal & { kind: "user" | "key" }, ports: Ports): Promise<Result<Limits>>;
  /** Requests counted for the principal's account in the current month (the metering counters). */
  usedThisMonth(principal: Principal & { kind: "user" | "key" }, ports: Ports): Promise<Result<number>>;
  /** Counts one request. Never allowed to change the response. */
  record(entry: { principal: Principal; endpoint: string; status: number }, ports: Ports): Promise<Result<void>>;
  /** The per-minute and per-IP counter (the RateLimiter port). */
  checkLimit(key: string, rule: Rule, ports: Ports): Promise<Result<Allowance>>;
  /** What an anonymous caller may do, per IP. */
  anonymousRule?: Rule;
};

export type Endpoint<I, O> = {
  /** For metering and logs, for example "me.get". */
  name: string;
  auth: AuthMode;
  /** A plan feature the caller's plan must include. */
  feature?: string;
  input(request: Request, principal: Principal): Promise<unknown> | unknown;
  strip: Strip<I, O>;
  /** Success status. Default 200. */
  status?: number;
};

const ANONYMOUS_RULE: Rule = { limit: 20, windowMs: 60_000 };
const MONTH_MS_FALLBACK = 31 * 24 * 60 * 60 * 1000;

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && first !== "" ? first : "unknown";
}

function startOfNextMonth(now: string): string {
  const d = new Date(now);
  if (Number.isNaN(d.getTime())) return new Date(Date.now() + MONTH_MS_FALLBACK).toISOString();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
}

function json(status: number, body: unknown, requestId: string, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "x-request-id": requestId, ...extra },
  });
}

export function createApiHandler(deps: ApiDeps): <I, O>(request: Request, endpoint: Endpoint<I, O>) => Promise<Response> {
  return async function handle<I, O>(request: Request, endpoint: Endpoint<I, O>): Promise<Response> {
    let ports: Ports;
    try {
      ports = await deps.ports();
    } catch {
      return json(500, errorBody("unexpected", GENERIC.unexpected, "unavailable"), "unavailable");
    }

    const earlyId = ports.ids.next();
    const fail = async (error: StepError, extra: Record<string, string> = {}, principal?: Principal): Promise<Response> => {
      const status = statusOf(error.kind);
      await note(principal ?? { kind: "anonymous", ip: clientIp(request) }, status);
      return json(status, errorBody(error.kind, publicMessage(error), earlyId), earlyId, extra);
    };
    const made = (kind: ErrorKind, text: string, userMessage?: string): StepError =>
      userMessage === undefined
        ? makeError(kind, `api.${endpoint.name}`, earlyId, text)
        : makeError(kind, `api.${endpoint.name}`, earlyId, text, { audience: "user", userMessage });

    /** Counts the request. A failure is logged and reported, and never changes the answer. */
    async function note(principal: Principal, status: number): Promise<void> {
      try {
        const r = await deps.record({ principal, endpoint: endpoint.name, status }, ports);
        if (!r.ok) telemetryProblem("metering", r.error);
      } catch (thrown) {
        telemetryProblem("metering", makeError("unexpected", `api.${endpoint.name}`, earlyId, thrown instanceof Error ? thrown.message : "metering failed"));
      }
    }

    function telemetryProblem(what: string, error: StepError): void {
      try {
        ports.logger.log({
          stripId: earlyId,
          step: `api.${endpoint.name}`,
          class: "api",
          phase: "debug",
          message: `${what} failed, continuing`,
          error: { kind: error.kind, audience: "internal", message: error.message },
        });
        ports.reporter.report(error, { strip: `api.${endpoint.name}`, stripId: earlyId, env: ports.env });
      } catch {
        // Telemetry never changes the response.
      }
    }

    // 1. who is calling
    let principal: Principal = { kind: "anonymous", ip: clientIp(request) };
    if (endpoint.auth !== "none") {
      const auth = await deps.authenticate(request, ports, endpoint.auth);
      if (!auth.ok) return fail(auth.error);
      principal = auth.value;
    }

    // 2. per-minute limit (per IP for an anonymous caller)
    let limits: Limits | null = null;
    let rule: Rule = deps.anonymousRule ?? ANONYMOUS_RULE;
    if (isSignedIn(principal)) {
      const l = await deps.limitsFor(principal, ports);
      if (!l.ok) return fail(l.error, {}, principal);
      limits = l.value;
      rule = { limit: limits.perMinute, windowMs: 60_000 };
    }
    let latest: Allowance | null = null;
    const counted = await deps.checkLimit(`minute:${principalKey(principal)}`, rule, ports);
    if (!counted.ok) {
      telemetryProblem("rate limit check", counted.error); // fail open
    } else {
      latest = counted.value;
      if (!counted.value.allowed) {
        return fail(made("rate_limited", "per-minute limit reached", "Too many requests. Try again later."), rateLimitHeaders(counted.value, ports.clock.now()), principal);
      }
    }

    // 3. monthly quota
    if (limits && isSignedIn(principal)) {
      const used = await deps.usedThisMonth(principal, ports);
      if (!used.ok) {
        telemetryProblem("quota check", used.error); // fail open
      } else if (used.value >= limits.perMonth) {
        const now = ports.clock.now();
        const reset = startOfNextMonth(now);
        const retry = Math.max(1, Math.ceil((Date.parse(reset) - Date.parse(now)) / 1000));
        return fail(
          made("rate_limited", "monthly quota used up", "You have used this month's quota. Upgrade your plan or wait until next month."),
          rateLimitHeaders({ allowed: false, limit: limits.perMonth, remaining: 0, resetAt: reset, retryAfterSeconds: retry }, now),
          principal,
        );
      }
    }

    // 4. entitlement
    if (endpoint.feature !== undefined && !(limits?.features ?? []).includes(endpoint.feature)) {
      return fail(made("forbidden", `plan does not include ${endpoint.feature}`, "Your plan does not include this feature."), {}, principal);
    }

    // 5. the strip
    let input: unknown;
    try {
      input = await endpoint.input(request, principal);
    } catch {
      return fail(made("validation", "the request could not be read", "The request could not be read."), {}, principal);
    }
    const result = await runStrip(endpoint.strip, ports, input as I);
    const headers = latest ? rateLimitHeaders(latest, ports.clock.now()) : {};

    if (result.ok) {
      const status = endpoint.status ?? 200;
      await note(principal, status);
      return json(status, { data: result.value }, result.stripId, headers);
    }
    const status = statusOf(result.error.kind);
    await note(principal, status);
    return json(status, errorBody(result.error.kind, publicMessage(result.error), result.stripId), result.stripId, headers);
  };
}
