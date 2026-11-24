// Route stub: the route lives in its feature. Delete this file when the feature is removed.
import { handleWebhook } from "../../../../features/billing/index.ts";
import { getRuntime } from "../../../runtime.ts";

export async function POST(request: Request) {
  return handleWebhook(request, (await getRuntime()).ports);
}
