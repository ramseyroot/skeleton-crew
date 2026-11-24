// Route stub: the route lives in its feature. Delete this file when the feature is removed.
import { meEndpoint } from "../../../../features/accounts/index.ts";
import { handleApi } from "../../../api.ts";

export const GET = (request: Request) => handleApi(request, meEndpoint);
