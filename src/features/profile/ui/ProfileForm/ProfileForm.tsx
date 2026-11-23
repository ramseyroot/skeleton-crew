"use client";

import type { Profile } from "../../domain.ts";
import { Toast } from "../../../../shared/ui/Toast/Toast.tsx";
import type { PublicResult, ViewState } from "../../../../shared/ui/view-state.ts";

export type ProfileFormProps = {
  /** The profile to show: from the profile.view strip. */
  profile: ViewState<Profile>;
  /** The last result of profile.save, if the form was submitted. */
  saved?: PublicResult<Profile> | null;
  /** True while a save is running. */
  pending?: boolean;
  /** The form action. The shell passes a Server Action. A story passes a no-op. */
  action: (formData: FormData) => void | Promise<void>;
};

/** Receives Result-shaped props only. It does not import or call a strip. */
export function ProfileForm({ profile, saved = null, pending = false, action }: ProfileFormProps) {
  if (profile.status === "loading") {
    return <p aria-busy="true">Loading profile...</p>;
  }
  if (profile.status === "empty") {
    return <p>There is no profile to show yet.</p>;
  }
  if (profile.status === "error") {
    return <Toast display={profile.display} />;
  }
  const { userId, displayName } = profile.value;
  return (
    <form action={action} style={{ display: "grid", gap: 12, maxWidth: 420 }}>
      <input type="hidden" name="userId" value={userId} />
      <label style={{ display: "grid", gap: 4 }}>
        <span>Display name</span>
        <input name="displayName" defaultValue={displayName} disabled={pending} maxLength={200} />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save"}
      </button>
      {saved && !saved.ok ? <Toast display={saved.display} /> : null}
      {saved?.ok ? <p role="status">Saved.</p> : null}
    </form>
  );
}
