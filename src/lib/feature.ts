// What a feature tells the app about itself (feature layout design, section 2).
//
// A feature lives in `src/features/<name>/` and owns its steps, strips, domain, UI and tests. The app needs to know
// only two things about it: which database collections to create at startup, and how to add demo data. The app
// lists its features in `src/app/features.ts`, one line each, so adding or removing a feature never means
// editing the runtime.

import type { CollectionDef } from "../ports/database.ts";
import type { Limits } from "./http.ts";
import type { Principal } from "./principal.ts";
import type { Result } from "./result.ts";
import type { Ports } from "./step.ts";

/**
 * What a feature adds to the API pipeline. `src/app/api.ts` reads these from the app's feature list, so the app
 * imports no feature, and a feature that is switched off simply contributes nothing. Every part is optional.
 */
export type ApiParts = {
  /** Who a session token belongs to. `unauthorized` when it is unknown, ended or expired. */
  sessionPrincipal?: (token: string, ports: Ports) => Promise<Result<Principal>>;
  /** Who an API key belongs to. `unauthorized` for any bad key. */
  keyPrincipal?: (key: string, ports: Ports) => Promise<Result<Principal>>;
  /** The limits and features of the account's plan. */
  limitsFor?: (accountId: string, ports: Ports) => Promise<Result<Limits>>;
  /** Requests counted for the account this month. */
  usedThisMonth?: (accountId: string, ports: Ports) => Promise<Result<number>>;
  /** Counts one request. `subject` is the key id, or "session". */
  record?: (
    entry: { accountId: string; subject: string; endpoint: string; outcome: "ok" | "client_error" | "server_error" },
    ports: Ports,
  ) => Promise<Result<void>>;
};

export type FeatureModule = {
  /** Lowercase letters, digits and hyphens. Matches the feature's folder name. */
  name: string;
  /** Created (or checked) by `database.migrate()` at startup. */
  collections: CollectionDef[];
  /** Adds demo data. Called only outside prod, and must be safe to call twice. */
  seed?: (ports: Ports) => Promise<Result<void>>;
  /** What this feature adds to the API pipeline, if anything. */
  api?: ApiParts;
};

const NAME = /^[a-z][a-z0-9-]*$/;

/** Checks a feature module when it is defined, so a typo fails on import and not at the first request. */
export function defineFeature(feature: FeatureModule): FeatureModule {
  if (!NAME.test(feature.name)) {
    throw new Error(`defineFeature: "${feature.name}" is not a valid feature name (lowercase letters, digits, hyphens)`);
  }
  const seen = new Set<string>();
  for (const c of feature.collections) {
    if (seen.has(c.name)) throw new Error(`defineFeature "${feature.name}": collection "${c.name}" is listed twice`);
    seen.add(c.name);
  }
  return feature;
}

/** Throws when two features declare the same collection, since they would overwrite each other's data. */
export function assertDistinctCollections(features: readonly FeatureModule[]): void {
  const owner = new Map<string, string>();
  for (const f of features) {
    for (const c of f.collections) {
      const other = owner.get(c.name);
      if (other !== undefined && other !== f.name) {
        throw new Error(`features "${other}" and "${f.name}" both declare the collection "${c.name}"`);
      }
      owner.set(c.name, f.name);
    }
  }
}
