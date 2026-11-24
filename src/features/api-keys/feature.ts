import { defineFeature } from "../../lib/feature.ts";
import { err, ok } from "../../lib/result.ts";
import { runStrip } from "../../lib/strip.ts";
import { collections } from "./domain.ts";
import { verifyApiKey } from "./strips/keys.verify.strip.ts";

/** What the api-keys feature tells the app: its collection. It has no demo data: a key is shown once, so a seed would have to print one. */
export const apiKeysFeature = defineFeature({
  name: "api-keys",
  collections,
  api: {
    keyPrincipal: async (key, ports) => {
      const verified = await runStrip(verifyApiKey, ports, { key });
      if (!verified.ok) return err(verified.error);
      return ok({ kind: "key" as const, accountId: verified.value.accountId, keyId: verified.value.keyId, role: verified.value.role });
    },
  },
});
