// The memory cache calls no provider. Corrupt entries and bad input are handled in the adapter itself,
// so nothing is mapped. Any failure that escapes is "unexpected".

import { createErrorMap } from "../../../lib/error-map.ts";

export const errorMap = createErrorMap([], "unexpected");
