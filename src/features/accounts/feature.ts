import { defineFeature } from "../../lib/feature.ts";
import { err, ok } from "../../lib/result.ts";
import { DEMO_ACCOUNT, collections } from "./domain.ts";

/**
 * What the accounts feature tells the app: the collections the local Auth adapter needs, and one demo account.
 * `seed` is safe to run twice: an account that already exists is left alone. The app never calls it in prod.
 */
export const accountsFeature = defineFeature({
  name: "accounts",
  collections,
  seed: async (ports) => {
    const created = await ports.auth.createAccount({ email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password });
    if (created.ok || created.error.kind === "conflict") return ok(undefined);
    return err(created.error);
  },
});
