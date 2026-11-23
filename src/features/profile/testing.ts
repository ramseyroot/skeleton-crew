// Test ports for this feature: real adapters, a fixed clock, a memory logger, and this feature's collections and demo data.

import { makeTestPorts as makeGenericTestPorts } from "../../test-utils/ports.ts";
import type { CacheKind, DatabaseKind } from "../../test-utils/ports.ts";
import { profileFeature } from "./feature.ts";

export { CACHE_KINDS, DATABASE_KINDS } from "../../test-utils/ports.ts";
export type { CacheKind, DatabaseKind };

export const makeTestPorts = (options: { database?: DatabaseKind; cache?: CacheKind; env?: string } = {}) =>
  makeGenericTestPorts({ ...options, features: [profileFeature] });
