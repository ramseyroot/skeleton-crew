import { z } from "zod";
import { defineStep } from "../../../../lib/step.ts";

/** Answers from plan data whether a feature is included. No plan name is compared anywhere. */
export const planAllows = defineStep({
  name: "pure.billing.planAllows",
  class: "pure",
  input: z.object({ features: z.array(z.string()), feature: z.string() }),
  output: z.object({ allowed: z.boolean() }),
  permissions: { reads: [], writes: [], storage: [] },
  errors: [],
  run: (input) => ({ allowed: input.features.includes(input.feature) }),
});
