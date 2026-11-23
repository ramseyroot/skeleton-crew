"use client";

import { useActionState } from "react";
import type { Profile } from "../domain/profile.ts";
import { ProfileForm } from "../components/ProfileForm/ProfileForm.tsx";
import type { PublicResult, ViewState } from "../shared/ui/view-state.ts";
import { saveProfileAction } from "./actions.ts";

/** Connects the form to the Server Action. All presentation stays in ProfileForm, which Storybook shows. */
export function ProfileEditor({ profile }: { profile: ViewState<Profile> }) {
  const [saved, action, pending] = useActionState<PublicResult<Profile> | null, FormData>(saveProfileAction, null);
  return <ProfileForm profile={profile} saved={saved} pending={pending} action={action} />;
}
