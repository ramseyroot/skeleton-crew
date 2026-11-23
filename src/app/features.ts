// The features this app has. One import and one array entry per feature.
// Adding a feature: its folder, a route stub if it has a page, and a line here. Removing it: the reverse.
// (`pnpm feature remove <name>` does this.)

import { assertDistinctCollections } from "../lib/feature.ts";
import type { FeatureModule } from "../lib/feature.ts";
import { profileFeature } from "../features/profile/index.ts";

export const features: readonly FeatureModule[] = [profileFeature];

assertDistinctCollections(features);
