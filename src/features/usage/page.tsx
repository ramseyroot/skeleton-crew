import { connection } from "next/server.js";
import type { Principal } from "../../lib/principal.ts";
import { runStrip } from "../../lib/strip.ts";
import { toPublicResult, viewStateOf } from "../../shared/ui/view-state.ts";
import { getRuntime } from "../../app/runtime.ts";
import { month } from "./strips/usage.month.strip.ts";
import { UsagePanel } from "./ui/UsagePanel/UsagePanel.tsx";

/** The usage page. The route stub passes the principal, so the feature does not need to know about sessions. */
export async function UsagePage({ principal }: { principal: Principal }) {
  await connection();
  const runtime = await getRuntime();
  const result = await runStrip(month, runtime.ports, { principal });
  return (
    <main>
      <h1>Usage</h1>
      <UsagePanel usage={viewStateOf(toPublicResult(result), (u) => u.total === 0)} />
    </main>
  );
}
