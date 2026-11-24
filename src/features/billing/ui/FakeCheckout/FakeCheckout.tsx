"use client";

import { Toast } from "../../../../shared/ui/Toast/Toast.tsx";
import type { PublicResult } from "../../../../shared/ui/view-state.ts";

export type FakeCheckoutProps = {
  /** The checkout reference from the address. */
  reference: string;
  /** The last result of billing.webhook, if a button was pressed and it failed. */
  last?: PublicResult<{ applied: boolean; reason: string }> | null;
  pending?: boolean;
  action: (formData: FormData) => void | Promise<void>;
};

/** The offline stand-in for the payment provider's page. It never charges anything. */
export function FakeCheckout({ reference, last = null, pending = false, action }: FakeCheckoutProps) {
  return (
    <form action={action} style={{ display: "grid", gap: 12, maxWidth: 420 }}>
      <p>This is a test checkout. No money moves. Reference: {reference || "(none)"}</p>
      <input type="hidden" name="reference" value={reference} />
      {last && !last.ok ? <Toast display={last.display} /> : null}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" name="outcome" value="success" disabled={pending || reference === ""}>
          Pay
        </button>
        <button type="submit" name="outcome" value="failed" disabled={pending || reference === ""}>
          Fail the payment
        </button>
      </div>
    </form>
  );
}
