// Failures are turned into error Results inside the adapter, with their kind chosen where they happen
// (for example an HTTP status in the Paystack adapter). Anything that escapes is "unexpected".

import { createErrorMap } from "../../../lib/error-map.ts";

export const errorMap = createErrorMap([]);
