// The rule registry. Every rule is listed here, in ID order.
// The meta tests require each rule to have fixtures and a section in docs/conformance-rules.md.

import type { Rule } from "../types.ts";
import { R01 } from "./R01-no-console.ts";
import { R02 } from "./R02-no-error-as-value.ts";
import { R03 } from "./R03-provider-import-boundary.ts";
import { R04 } from "./R04-no-raw-queries.ts";

export const rules: Rule[] = [R01, R02, R03, R04];
