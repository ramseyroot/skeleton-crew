"use server";

import type { Profile } from "../domain/profile.ts";
import { runStrip } from "../lib/strip.ts";
import { toPublicResult } from "../shared/ui/view-state.ts";
import type { PublicResult } from "../shared/ui/view-state.ts";
import { saveProfile } from "../strips/profile.save.strip.ts";
import { getRuntime } from "./runtime.ts";

const text = (value: FormDataEntryValue | null): string => (typeof value === "string" ? value : "");

/**
 * The Server Action behind the profile form. It runs the strip on the server and returns a PublicResult:
 * the display and the reference code, never the StepError.
 */
export async function saveProfileAction(_previous: PublicResult<Profile> | null, formData: FormData): Promise<PublicResult<Profile>> {
  const runtime = await getRuntime();
  const result = await runStrip(saveProfile, runtime.ports, {
    userId: text(formData.get("userId")),
    displayName: text(formData.get("displayName")),
  });
  return toPublicResult(result);
}
