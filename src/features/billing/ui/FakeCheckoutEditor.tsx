"use client";

import { useActionState } from "react";
import { FakeCheckout } from "./FakeCheckout/FakeCheckout.tsx";
import type { PublicResult } from "../../../shared/ui/view-state.ts";
import { fakeCheckoutAction } from "../actions.ts";

/** Connects the test checkout to its Server Action. */
export function FakeCheckoutEditor({ reference }: { reference: string }) {
  const [last, action, pending] = useActionState<PublicResult<{ applied: boolean; reason: string }> | null, FormData>(fakeCheckoutAction, null);
  return <FakeCheckout reference={reference} last={last} pending={pending} action={action} />;
}
