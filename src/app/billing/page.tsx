// Route stub: the page lives in its feature. Delete this file when the feature is removed.
import { BillingPage } from "../../features/billing/page.tsx";
import { currentPrincipal } from "../session.ts";

export default async function Page() {
  return BillingPage({ principal: await currentPrincipal() });
}
