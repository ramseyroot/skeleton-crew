// Route stub: the page lives in its feature. Delete this file when the feature is removed.
import { KeysPage } from "../../features/api-keys/page.tsx";
import { currentPrincipal } from "../session.ts";

export default async function Page() {
  return KeysPage({ principal: await currentPrincipal() });
}
