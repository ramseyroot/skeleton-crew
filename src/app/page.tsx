import { toPublicResult, viewStateOf } from "../shared/ui/view-state.ts";
import { runStrip } from "../lib/strip.ts";
import { viewProfile } from "../strips/profile.view.strip.ts";
import { ProfileEditor } from "./ProfileEditor.tsx";
import { getRuntime } from "./runtime.ts";

// Read on every request, so the cache and the database are both exercised.
export const dynamic = "force-dynamic";

const DEMO_USER_ID = "u1";

export default async function Page() {
  const runtime = await getRuntime();
  const result = await runStrip(viewProfile, runtime.ports, { userId: DEMO_USER_ID });
  return (
    <main>
      <h1>Profile</h1>
      <ProfileEditor profile={viewStateOf(toPublicResult(result))} />
      <p style={{ color: "#667085", fontSize: 13 }}>
        profile: {runtime.profile.env} | dev: {String(runtime.dev)} | database: {runtime.ports.database.name} | cache: {runtime.ports.cache.name}
      </p>
    </main>
  );
}
