import { defineFeature } from "../../lib/feature.ts";
import { err, ok } from "../../lib/result.ts";
import { DEMO_USERS, collections, nameFields } from "./domain.ts";

/**
 * What the profile feature tells the app: the collections to create and the demo data to add.
 * `seed` adds the demo users and is safe to run twice.
 */
export const profileFeature = defineFeature({
  name: "profile",
  collections,
  seed: async (ports) => {
    for (const user of DEMO_USERS) {
      const existing = await ports.database.read("users").get(user.id);
      if (!existing.ok) return err(existing.error);
      if (existing.value === null) {
        const created = await ports.database.write("users").create({ id: user.id, ...nameFields(user.displayName) });
        if (!created.ok) return err(created.error);
      }
    }
    return ok(undefined);
  },
});
