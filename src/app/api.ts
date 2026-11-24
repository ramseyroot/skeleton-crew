// Builds the API pipeline from the app's feature list. This file imports no feature: each feature carries its own
// `api` parts (see ApiParts in src/lib/feature.ts), so switching a feature off leaves this file as it is.
// With no feature behind a part, the pipeline uses a safe default: nobody can sign in, plans do not limit, nothing is counted.

import type { ApiParts, FeatureModule } from "../lib/feature.ts";
import { createApiHandler } from "../lib/http.ts";
import type { ApiDeps, Limits } from "../lib/http.ts";
import type { Principal } from "../lib/principal.ts";
import { err, makeError, ok } from "../lib/result.ts";
import type { Result } from "../lib/result.ts";
import type { Ports } from "../lib/step.ts";
import { SESSION_COOKIE } from "../shared/session.ts";
import { features } from "./features.ts";
import { getRuntime } from "./runtime.ts";

/** Used when no feature sets limits: a modest burst limit and no monthly cap. */
export const DEFAULT_LIMITS: Limits = { perMinute: 60, perMonth: Number.MAX_SAFE_INTEGER, features: [] };

const NEEDS_SIGN_IN = "You need to sign in, or send a valid API key.";

const unauthorized = (stripId: string, text: string) =>
  err(makeError("unauthorized", "api.authenticate", stripId, text, { audience: "user", userMessage: NEEDS_SIGN_IN }));

/** The key from `Authorization: Bearer <key>` or `X-API-Key`. */
function presentedKey(request: Request): string | null {
  const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  return bearer?.[1] ?? request.headers.get("x-api-key")?.trim() ?? null;
}

function sessionToken(request: Request): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=") || null;
  }
  return null;
}

function outcomeOf(status: number): "ok" | "client_error" | "server_error" {
  return status < 400 ? "ok" : status < 500 ? "client_error" : "server_error";
}

/** The pipeline's dependencies, made from the given features. Tests pass their own list and ports. */
export function buildApiDeps(list: readonly FeatureModule[], getPorts: () => Promise<Ports>): ApiDeps {
  const part = <K extends keyof ApiParts>(name: K): ApiParts[K] | undefined => {
    for (const f of list) {
      const found = f.api?.[name];
      if (found) return found;
    }
    return undefined;
  };

  return {
    ports: getPorts,

    async authenticate(request, ports, mode): Promise<Result<Principal>> {
      const stripId = ports.ids.next();
      const key = mode === "session" ? null : presentedKey(request);
      if (key !== null) {
        const byKey = part("keyPrincipal");
        return byKey ? byKey(key, ports) : unauthorized(stripId, "API keys are not enabled");
      }
      const token = mode === "key" ? null : sessionToken(request);
      if (token !== null) {
        const bySession = part("sessionPrincipal");
        return bySession ? bySession(token, ports) : unauthorized(stripId, "sessions are not enabled");
      }
      return unauthorized(stripId, "no credentials");
    },

    async limitsFor(principal, ports) {
      const limits = part("limitsFor");
      return limits ? limits(principal.accountId, ports) : ok(DEFAULT_LIMITS);
    },

    async usedThisMonth(principal, ports) {
      const used = part("usedThisMonth");
      return used ? used(principal.accountId, ports) : ok(0);
    },

    async record(entry, ports) {
      const record = part("record");
      if (!record || entry.principal.kind === "anonymous") return ok(undefined);
      const subject = entry.principal.kind === "key" ? entry.principal.keyId : "session";
      return record({ accountId: entry.principal.accountId, subject, endpoint: entry.endpoint, outcome: outcomeOf(entry.status) }, ports);
    },

    checkLimit: (key, rule, ports) => ports.limiter.check(key, rule),
  };
}

/** The handler the route files call: `handleApi(request, endpoint)`. */
export const handleApi = createApiHandler(buildApiDeps(features, async () => (await getRuntime()).ports));
