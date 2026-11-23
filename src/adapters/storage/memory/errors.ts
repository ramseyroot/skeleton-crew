// The memory storage calls no provider. Bad keys and limits are reported by the adapter itself as
// validation errors, so nothing is mapped. Any failure that escapes is "unexpected".

import { createErrorMap } from "../../../lib/error-map.ts";

export const errorMap = createErrorMap([], "unexpected");
