import { err, makeError, ok } from "../../../../lib/result.ts";
import { requireSignedIn } from "../../../../lib/authz.ts";
import { defineStep } from "../../../../lib/step.ts";
import { CheckedCreateSchema, CreateRequestSchema } from "../../domain.ts";

/** Checks who is asking and the form: a name of 1 to 60 characters, and an optional expiry of 1 to 365 days. */
export const parseKeyCreate = defineStep({
  name: "pure.keys.parseCreate",
  class: "pure",
  input: CreateRequestSchema,
  output: CheckedCreateSchema,
  permissions: { reads: [], writes: [], storage: [] },
  errors: ["validation", "unauthorized"],
  run: (input, ctx) => {
    const who = requireSignedIn(input.principal, { step: "pure.keys.parseCreate", stripId: ctx.stripId });
    if (!who.ok) return who;
    const name = input.name.trim();
    if (name.length < 1 || name.length > 60) {
      return err(
        makeError("validation", "pure.keys.parseCreate", ctx.stripId, `key name has ${name.length} characters`, {
          audience: "user",
          userMessage: "Give the key a name of 1 to 60 characters.",
        }),
      );
    }
    const days = input.expiresInDays ?? null;
    if (days !== null && (!Number.isInteger(days) || days < 1 || days > 365)) {
      return err(
        makeError("validation", "pure.keys.parseCreate", ctx.stripId, `expiry of ${days} days`, {
          audience: "user",
          userMessage: "Choose an expiry between 1 and 365 days, or none.",
        }),
      );
    }
    return ok({ principal: input.principal, name, expiresInDays: days });
  },
});
