// This adapter calls no provider that can fail in a way steps need to tell apart, and telemetry never reports
// failures back to its caller, so nothing is mapped. A failure that escapes is "unexpected".

import { createErrorMap } from "../../../lib/error-map.ts";

export const errorMap = createErrorMap([]);
