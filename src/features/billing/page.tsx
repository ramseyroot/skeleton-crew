import { notFound } from "next/navigation.js";
import { connection } from "next/server.js";
import type { Principal } from "../../lib/principal.ts";
import { runStrip } from "../../lib/strip.ts";
import { toPublicResult, viewStateOf } from "../../shared/ui/view-state.ts";
import { getRuntime } from "../../app/runtime.ts";
import { hasFakeCheckout } from "./billing.ts";
import { plan } from "./strips/billing.plan.strip.ts";
import { BillingEditor } from "./ui/BillingEditor.tsx";
import { FakeCheckoutEditor } from "./ui/FakeCheckoutEditor.tsx";

// Two pages in one file, because a route stub may import only this file (rule R42). Each stub re-exports one.

/** The billing page. The route stub passes the principal, so the feature does not need to know about sessions. */
export async function BillingPage({ principal }: { principal: Principal }) {
  await connection();
  const runtime = await getRuntime();
  const result = await runStrip(plan, runtime.ports, { principal });
  return (
    <main>
      <h1>Billing</h1>
      <BillingEditor plan={viewStateOf(toPublicResult(result))} />
    </main>
  );
}

/** The offline checkout page. It exists only while the fake payments adapter is active. */
export async function FakeCheckoutPage({ searchParams }: { searchParams: Promise<{ reference?: string }> }) {
  await connection();
  const runtime = await getRuntime();
  if (!hasFakeCheckout(runtime.ports)) notFound();
  const { reference } = await searchParams;
  return (
    <main>
      <h1>Test checkout</h1>
      <FakeCheckoutEditor reference={reference ?? ""} />
    </main>
  );
}
