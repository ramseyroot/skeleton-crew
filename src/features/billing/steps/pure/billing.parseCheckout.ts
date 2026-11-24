import { err, makeError, ok } from "../../../../lib/result.ts";
import { requireSignedIn } from "../../../../lib/authz.ts";
import { defineStep } from "../../../../lib/step.ts";
import { CheckedCheckoutSchema, CheckoutRequestSchema } from "../../domain.ts";

/** A return address is a path on this site ("/billing") or a full http(s) address. Anything else is refused. */
const validReturn = (url: string): boolean => {
  if (url.startsWith("/")) return !url.startsWith("//") && !url.includes("\\");
  try {
    return ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
};

/** Checks who is asking, that a plan was chosen, and the return address. */
export const parseCheckout = defineStep({
  name: "pure.billing.parseCheckout",
  class: "pure",
  input: CheckoutRequestSchema,
  output: CheckedCheckoutSchema,
  permissions: { reads: [], writes: [], storage: [] },
  errors: ["validation", "unauthorized"],
  run: (input, ctx) => {
    const who = requireSignedIn(input.principal, { step: "pure.billing.parseCheckout", stripId: ctx.stripId });
    if (!who.ok) return who;
    const planId = input.planId.trim();
    if (planId === "") {
      return err(makeError("validation", "pure.billing.parseCheckout", ctx.stripId, "no plan chosen", { audience: "user", userMessage: "Choose a plan." }));
    }
    if (!validReturn(input.returnUrl)) {
      return err(makeError("validation", "pure.billing.parseCheckout", ctx.stripId, "bad return address"));
    }
    return ok({ principal: input.principal, planId, returnUrl: input.returnUrl });
  },
});
