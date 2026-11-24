// The memory adapter calls no provider. Its own failures (validation, conflict, unauthorized, not_found) are
// returned as Results by the adapter code. A failure of scrypt itself or anything else that escapes is "unexpected".

import { createErrorMap } from "../../../lib/error-map.ts";

export const errorMap = createErrorMap([], "unexpected");
