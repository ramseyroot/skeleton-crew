// The features this app has. One import line and one entry line per feature.
// `pnpm feature disable|enable <name>` edits this file, so keep that format.
// Adding a feature: its folder (with feature.json), then `pnpm feature enable <name> --yes`.

import { assertDistinctCollections } from "../lib/feature.ts";
import type { FeatureModule } from "../lib/feature.ts";
import { profileFeature } from "../features/profile/index.ts";
import { accountsFeature } from "../features/accounts/index.ts";

export const features: readonly FeatureModule[] = [
  profileFeature,
  accountsFeature,
];

assertDistinctCollections(features);
