import { defineStrip } from "../../../lib/strip.ts";
import { planAllows } from "../steps/pure/billing.planAllows.ts";

/**
 * billing.entitlement: does a plan include a feature?
 *
 * Trigger:     the API pipeline, for an endpoint that names a feature, input `{ features, feature }`
 *              (`features` comes from billing.plan).
 * End states:  success -> `{ allowed }`. The pipeline answers 403 when it is false.
 * Side effects: none.
 */
export const entitlement = defineStrip({
  name: "billing.entitlement",
  budget: { reads: [], writes: [], storage: [] },
  steps: [planAllows],
  invalidates: [],
  routing: { "*": "abort" },
});
