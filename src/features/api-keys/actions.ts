"use server";

import { revalidatePath } from "next/cache.js";
import { getRuntime } from "../../app/runtime.ts";
import { currentPrincipal } from "../../app/session.ts";
import type { PublicResult } from "../../shared/ui/view-state.ts";
import { runKeyIntent } from "./portal.ts";
import type { KeyOutcome } from "./portal.ts";

/** The one Server Action behind the keys page (create, rotate, revoke). It returns a PublicResult, never a StepError. */
export async function keyAction(_previous: PublicResult<KeyOutcome> | null, formData: FormData): Promise<PublicResult<KeyOutcome>> {
  const runtime = await getRuntime();
  const result = await runKeyIntent(runtime.ports, await currentPrincipal(), formData);
  if (result.ok) revalidatePath("/keys");
  return result;
}
