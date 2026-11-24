import { connection } from "next/server.js";
import type { Principal } from "../../lib/principal.ts";
import { runStrip } from "../../lib/strip.ts";
import { toPublicResult, viewStateOf } from "../../shared/ui/view-state.ts";
import { getRuntime } from "../../app/runtime.ts";
import { listApiKeys } from "./strips/keys.list.strip.ts";
import { KeysEditor } from "./ui/KeysEditor.tsx";

/** The keys portal. The route stub passes the principal, so the feature does not need to know about sessions. */
export async function KeysPage({ principal }: { principal: Principal }) {
  await connection();
  const runtime = await getRuntime();
  const result = await runStrip(listApiKeys, runtime.ports, { principal });
  return (
    <main>
      <h1>API keys</h1>
      <KeysEditor keys={viewStateOf(toPublicResult(result), (v) => v.keys.length === 0)} />
    </main>
  );
}
