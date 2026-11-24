"use client";

import type { CurrentPlan, Plan } from "../../domain.ts";
import { Toast } from "../../../../shared/ui/Toast/Toast.tsx";
import type { PublicResult, ViewState } from "../../../../shared/ui/view-state.ts";
import type { BillingOutcome } from "../../billing.ts";

export type BillingPanelProps = {
  /** The current plan and the plans on offer: from the billing.plan strip. */
  plan: ViewState<CurrentPlan>;
  /** The last result of billing.checkout or billing.cancel, if a form was submitted. */
  last?: PublicResult<BillingOutcome> | null;
  /** True while a form is being sent. */
  pending?: boolean;
  /** The form action. The shell passes a Server Action. A story passes a no-op. */
  action: (formData: FormData) => void | Promise<void>;
};

const price = (p: Plan): string => (p.priceMinor === 0 ? "free" : `${(p.priceMinor / 100).toFixed(2)} ${p.currency} per month`);

/** Receives Result-shaped props only. It does not import or call a strip. */
export function BillingPanel({ plan, last = null, pending = false, action }: BillingPanelProps) {
  if (plan.status === "loading") return <p aria-busy="true">Loading your plan...</p>;
  if (plan.status === "empty") return <p>There are no plans yet.</p>;
  if (plan.status === "error") {
    return (
      <div>
        <Toast display={plan.display} />
        <a href="/login">Log in</a>
      </div>
    );
  }
  const { plan: current, subscription, available } = plan.value;
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 640 }}>
      {last && !last.ok ? <Toast display={last.display} /> : null}
      {last?.ok && last.value.kind === "cancelled" ? <p role="status">Subscription cancelled. You are on the free plan.</p> : null}
      <section>
        <h2>Your plan: {current.name}</h2>
        <p>
          {current.perMinute} requests per minute, {current.perMonth} per month. Features: {current.features.join(", ")}.
        </p>
        {subscription?.status === "active" ? (
          <form action={action}>
            <input type="hidden" name="intent" value="cancel" />
            <button type="submit" disabled={pending}>
              {pending ? "Working..." : "Cancel subscription"}
            </button>
          </form>
        ) : null}
      </section>
      <section>
        <h2>Plans</h2>
        <ul style={{ display: "grid", gap: 8, padding: 0, listStyle: "none" }}>
          {available.map((p) => (
            <li key={p.id} style={{ border: "1px solid #d0d5dd", padding: 12 }}>
              <strong>{p.name}</strong> ({price(p)}): {p.perMinute} per minute, {p.perMonth} per month.
              {p.id === current.id ? (
                <span> Current plan.</span>
              ) : p.priceMinor > 0 ? (
                <form action={action}>
                  <input type="hidden" name="intent" value="checkout" />
                  <input type="hidden" name="planId" value={p.id} />
                  <button type="submit" disabled={pending}>
                    {pending ? "Working..." : `Upgrade to ${p.name}`}
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
