// The null cache stores nothing and calls no provider, so nothing is mapped.
// Any failure that escapes is "unexpected".

import { createErrorMap } from "../../../lib/error-map.ts";

export const errorMap = createErrorMap([], "unexpected");
