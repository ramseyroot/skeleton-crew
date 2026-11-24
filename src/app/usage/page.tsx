// Route stub: the page lives in its feature. Delete this file when the feature is removed.
import { UsagePage } from "../../features/usage/page.tsx";
import { currentPrincipal } from "../session.ts";

export default async function Page() {
  return UsagePage({ principal: await currentPrincipal() });
}
