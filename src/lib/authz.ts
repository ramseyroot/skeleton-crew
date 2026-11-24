// Authorization helpers (platform parts design, section 4a). Plain functions with no I/O, called at the top of a
// step's `run`. They are not steps: a step has exact input and output types and cannot be a pass-through check.
// Roles are separate from plan entitlements: a role says who a person is, a plan says what they bought.

import type { Principal, Role, SignedIn } from "./principal.ts";
import { isSignedIn } from "./principal.ts";
import { err, makeError, ok } from "./result.ts";
import type { Result } from "./result.ts";

type Where = { step: string; stripId: string };

export function requireSignedIn(principal: Principal, where: Where): Result<SignedIn> {
  if (isSignedIn(principal)) return ok(principal);
  return err(
    makeError("unauthorized", where.step, where.stripId, "no signed-in principal", {
      audience: "user",
      userMessage: "You need to sign in, or send a valid API key.",
    }),
  );
}

/** The principal must own the record, unless it is an admin. */
export function requireOwner(principal: Principal, ownerAccountId: string, where: Where): Result<SignedIn> {
  const signedIn = requireSignedIn(principal, where);
  if (!signedIn.ok) return signedIn;
  if (signedIn.value.accountId === ownerAccountId || signedIn.value.role === "admin") return signedIn;
  return err(
    makeError("forbidden", where.step, where.stripId, `account ${signedIn.value.accountId} does not own this record`, {
      audience: "user",
      userMessage: "You do not have access to this.",
    }),
  );
}

export function requireRole(principal: Principal, role: Role, where: Where): Result<SignedIn> {
  const signedIn = requireSignedIn(principal, where);
  if (!signedIn.ok) return signedIn;
  if (signedIn.value.role === role) return signedIn;
  return err(
    makeError("forbidden", where.step, where.stripId, `role ${signedIn.value.role} is not ${role}`, {
      audience: "user",
      userMessage: "You do not have access to this.",
    }),
  );
}
