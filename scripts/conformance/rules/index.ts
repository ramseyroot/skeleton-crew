// The rule registry. Every rule is listed here, in ID order.
// The meta tests require each rule to have fixtures and a section in docs/conformance-rules.md.

import type { Rule } from "../types.ts";
import { R01 } from "./R01-no-console.ts";
import { R02 } from "./R02-no-error-as-value.ts";
import { R03 } from "./R03-provider-import-boundary.ts";
import { R04 } from "./R04-no-raw-queries.ts";
import { R05 } from "./R05-step-name-format.ts";
import { R06 } from "./R06-strip-name-format.ts";
import { R07 } from "./R07-unique-names.ts";
import { R08 } from "./R08-near-duplicate-names.ts";
import { R09 } from "./R09-step-must-be-defined.ts";
import { R10 } from "./R10-step-manifest-complete.ts";
import { R11 } from "./R11-manifest-static.ts";
import { R12 } from "./R12-strip-routing-complete.ts";
import { R13 } from "./R13-strip-budget.ts";
import { R14 } from "./R14-strip-invalidates.ts";
import { R15 } from "./R15-strip-routing-unknown-step.ts";
import { R16 } from "./R16-catalog-current.ts";
import { R17 } from "./R17-no-widening.ts";
import { R18 } from "./R18-port-two-adapters.ts";
import { R19 } from "./R19-port-contract-test.ts";
import { R20 } from "./R20-adapter-runs-contract.ts";
import { R21 } from "./R21-adapter-error-map.ts";
import { R22 } from "./R22-port-domain-types.ts";
import { R23 } from "./R23-profile-valid.ts";
import { R24 } from "./R24-local-hosts-only.ts";
import { R25 } from "./R25-profile-adapter-registered.ts";
import { R26 } from "./R26-no-prod-secrets-outside-prod.ts";
import { R27 } from "./R27-destructive-script-guard.ts";
import { R28 } from "./R28-coverage-valid.ts";
import { R29 } from "./R29-exception-valid.ts";
import { R30 } from "./R30-exception-unused.ts";
import { R31 } from "./R31-steering-size.ts";
import { R32 } from "./R32-plan-reuse-matches.ts";
import { R33 } from "./R33-plan-impact-complete.ts";
import { R34 } from "./R34-tasks-write-declared.ts";
import { R35 } from "./R35-tasks-write-disjoint.ts";
import { R36 } from "./R36-parallel-new-files-only.ts";
import { R37 } from "./R37-change-in-plan.ts";
import { R38 } from "./R38-plan-shared-new-once.ts";
import { R39 } from "./R39-plan-no-near-duplicates.ts";

export const rules: Rule[] = [R01, R02, R03, R04, R05, R06, R07, R08, R09, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20, R21, R22, R23, R24, R25, R26, R27, R28, R29, R30, R31, R32, R33, R34, R35, R36, R37, R38, R39];
