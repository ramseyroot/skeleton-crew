// What happens between the billing pages and the strips, without Next.js, so tests can run it.
// The Server Actions only add the session lookup, the return address and the redirect.

import { runStrip } from "../../lib/strip.ts";
import type { Ports } from "../../lib/step.ts";
import type { Principal } from "../../lib/principal.ts";
import { toPublicResult } from "../../shared/ui/view-state.ts";
import type { PublicResult } from "../../shared/ui/view-state.ts";
import type { Payments } from "../../ports/payments.ts";
import { cancel } from "./strips/billing.cancel.strip.ts";
import { checkout } from "./strips/billing.checkout.strip.ts";
import { webhook } from "./strips/billing.webhook.strip.ts";

export type BillingOutcome = { kind: "checkout"; url: string } | { kind: "cancelled" };

const text = (value: FormDataEntryValue | null): string => (typeof value === "string" ? value : "");

/** Reads the form's `intent` (checkout or cancel) and runs the matching strip. */
export async function runBillingIntent(
  ports: Ports,
  principal: Principal,
  form: FormData,
  returnUrl: string,
): Promise<PublicResult<BillingOutcome>> {
  const intent = text(form.get("intent"));
  if (intent === "checkout") {
    const r = await runStrip(checkout, ports, { principal, planId: text(form.get("planId")), returnUrl });
    return r.ok ? toPublicResult({ ...r, value: { kind: "checkout" as const, url: r.value.url } }) : toPublicResult(r);
  }
  if (intent === "cancel") {
    const r = await runStrip(cancel, ports, { principal });
    return r.ok ? toPublicResult({ ...r, value: { kind: "cancelled" as const } }) : toPublicResult(r);
  }
  // An unknown intent is a bug in the page, not something the user can fix.
  return { ok: false, display: { type: "generic", reference: "unknown-intent" }, stripId: "unknown-intent" };
}

type SignsEvents = Payments & {
  signedEvent(reference: string, outcome: "success" | "failed" | "cancelled"): { ok: true; value: { headers: Record<string, string>; rawBody: string } } | { ok: false };
};
const canSign = (p: Payments): p is SignsEvents => typeof (p as Partial<SignsEvents>).signedEvent === "function";

/** True when the active payments adapter is the offline fake, the only one with a checkout page of ours. */
export const hasFakeCheckout = (ports: Ports): boolean => canSign(ports.payments);

/**
 * The offline "provider's website": the customer pays, fails or cancels. It sends the same signed event a real
 * provider would, through the real `billing.webhook` strip, so the signature check and the idempotency run offline.
 */
export async function completeFakeCheckout(
  ports: Ports,
  reference: string,
  outcome: "success" | "failed" | "cancelled",
): Promise<PublicResult<{ applied: boolean; reason: string }>> {
  if (!canSign(ports.payments)) {
    return { ok: false, display: { type: "toast", message: "There is no test checkout with this payment provider." }, stripId: "fake-checkout" };
  }
  const signed = ports.payments.signedEvent(reference, outcome);
  if (!signed.ok) {
    return { ok: false, display: { type: "toast", message: "That checkout does not exist." }, stripId: "fake-checkout" };
  }
  return toPublicResult(await runStrip(webhook, ports, signed.value));
}
