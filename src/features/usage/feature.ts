import { defineFeature } from "../../lib/feature.ts";
import { collections } from "./domain.ts";

/** What the usage feature tells the app: its collection. Usage comes from real requests, so there is no demo data. */
export const usageFeature = defineFeature({ name: "usage", collections });
