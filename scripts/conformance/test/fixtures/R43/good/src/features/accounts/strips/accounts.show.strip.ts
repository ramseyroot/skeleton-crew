import { backupStep } from "../steps/pure/accounts.backup.ts";
import { usedStep } from "../steps/pure/accounts.used.ts";
declare function defineStrip(x: unknown): unknown;
export const show = defineStrip({ name: "accounts.show", budget: { reads: [], writes: [], storage: [] }, steps: [usedStep], fallbacks: [backupStep], invalidates: [], routing: { "*": "abort" } });
