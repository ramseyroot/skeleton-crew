// The local adapter calls the Database port, which returns Results, so nothing is mapped from a provider.
// Its own failures are returned as Results by the adapter code. A throw from scrypt or anything else is "unexpected".

import { createErrorMap } from "../../../lib/error-map.ts";

export const errorMap = createErrorMap([], "unexpected");
