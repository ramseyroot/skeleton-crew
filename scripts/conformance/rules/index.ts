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

export const rules: Rule[] = [R01, R02, R03, R04, R05, R06, R07, R08, R09, R10, R11, R12, R13, R14, R15, R16, R17];
