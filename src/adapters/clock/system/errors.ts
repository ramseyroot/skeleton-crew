// This adapter calls no provider that can fail in a way steps need to tell apart, so nothing is mapped.
// Any failure that escapes is "unexpected" (the step wrapper reports it that way).

import { createErrorMap } from "../../../lib/error-map.ts";

export const errorMap = createErrorMap([]);
