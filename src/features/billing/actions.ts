"use server";

import { revalidatePath } from "next/cache.js";
import { headers } from "next/headers.js";
import { redirect } from "next/navigation.js";
import { getRuntime } from "../../app/runtime.ts";
import { currentPrincipal } from "../../app/session.ts";
import type { PublicResult } from "../../shared/ui/view-state.ts";
import { completeFakeCheckout, runBillingIntent } from "./billing.ts";
import type { BillingOutcome } from "./billing.ts";

/** Where the provider sends the customer back to: APP_URL when it is set, else the address of this request. */
async function returnUrl(): Promise<string> {
  const base = process.env.APP_URL?.replace(/\/$/, "");
  if (base) return `${base}/billing`;
  const h = await headers();
  const host = h.get("host");
  return host ? `${h.get("x-forwarded-proto") ?? "http"}://${host}/billing` : "/billing";
}

/** The one Server Action behind the billing page (checkout or cancel). Returns a PublicResult, never a StepError. */
export async function billingAction(_previous: PublicResult<BillingOutcome> | null, formData: FormData): Promise<PublicResult<BillingOutcome>> {
  const runtime = await getRuntime();
  const result = await runBillingIntent(runtime.ports, await currentPrincipal(), formData, await returnUrl());
  if (result.ok && result.value.kind === "checkout") redirect(result.value.url);
  if (result.ok) revalidatePath("/billing");
  return result;
}

/** The Server Action behind the offline checkout page. */
export async function fakeCheckoutAction(
  _previous: PublicResult<{ applied: boolean; reason: string }> | null,
  formData: FormData,
): Promise<PublicResult<{ applied: boolean; reason: string }>> {
  const runtime = await getRuntime();
  const reference = String(formData.get("reference") ?? "");
  const raw = String(formData.get("outcome") ?? "");
  const outcome = raw === "success" || raw === "failed" || raw === "cancelled" ? raw : "failed";
  const result = await completeFakeCheckout(runtime.ports, reference, outcome);
  if (result.ok) redirect("/billing");
  return result;
}
