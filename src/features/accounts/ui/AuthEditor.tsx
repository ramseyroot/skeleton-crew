"use client";

import { useActionState } from "react";
import type { AccountView } from "../domain.ts";
import { AuthForm } from "./AuthForm/AuthForm.tsx";
import type { PublicResult } from "../../../shared/ui/view-state.ts";
import { loginAction, signupAction } from "../actions.ts";

/** Connects the form to the Server Actions. All presentation stays in AuthForm, which Storybook shows. */
export function AuthEditor({ mode }: { mode: "login" | "signup" }) {
  const [result, action, pending] = useActionState<PublicResult<AccountView> | null, FormData>(
    mode === "login" ? loginAction : signupAction,
    null,
  );
  return <AuthForm mode={mode} result={result} pending={pending} action={action} />;
}
