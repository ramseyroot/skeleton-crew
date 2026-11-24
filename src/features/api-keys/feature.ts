import { defineFeature } from "../../lib/feature.ts";
import { collections } from "./domain.ts";

/** What the api-keys feature tells the app: its collection. It has no demo data: a key is shown once, so a seed would have to print one. */
export const apiKeysFeature = defineFeature({ name: "api-keys", collections });
