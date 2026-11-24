// The one endpoint of the accounts feature: who am I. The route stub `src/app/api/v1/me/route.ts` hands it to the pipeline.

import type { Endpoint } from "../../lib/http.ts";
import type { AccountView } from "./domain.ts";
import { me } from "./strips/accounts.me.strip.ts";

/** `GET /api/v1/me`: the account of the caller, by key or by session. */
export const meEndpoint: Endpoint<{ accountId: string }, AccountView> = {
  name: "me.get",
  auth: "either",
  input: (_request, principal) => ({ accountId: principal.kind === "anonymous" ? "" : principal.accountId }),
  strip: me,
};
