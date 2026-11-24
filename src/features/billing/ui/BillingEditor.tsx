"use client";

import { useActionState } from "react";
import type { CurrentPlan } from "../domain.ts";
import { BillingPanel } from "./BillingPanel/BillingPanel.tsx";
import type { PublicResult, ViewState } from "../../../shared/ui/view-state.ts";
import { billingAction } from "../actions.ts";
import type { BillingOutcome } from "../billing.ts";

/** Connects the panel to the Server Action. All presentation stays in BillingPanel, which Storybook shows. */
export function BillingEditor({ plan }: { plan: ViewState<CurrentPlan> }) {
  const [last, action, pending] = useActionState<PublicResult<BillingOutcome> | null, FormData>(billingAction, null);
  return <BillingPanel plan={plan} last={last} pending={pending} action={action} />;
}
