// The memory adapter calls no provider. Its own failures (validation, conflict, not_found) are returned as
// Results by the adapter code, so nothing needs mapping here. Anything that escapes is "unexpected".

import { createErrorMap } from "../../../lib/error-map.ts";

export const errorMap = createErrorMap([], "unexpected");
