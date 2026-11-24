// The database limiter delegates to the Database port, which returns its own error Results.
// A failure that is thrown instead (a broken Database implementation) is "unexpected".

import { createErrorMap } from "../../../lib/error-map.ts";

export const errorMap = createErrorMap([], "unexpected");
