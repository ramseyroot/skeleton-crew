"use client";

import { Toast } from "../../../../shared/ui/Toast/Toast.tsx";
import type { PublicResult } from "../../../../shared/ui/view-state.ts";
import type { AccountView } from "../../domain.ts";

export type AuthFormProps = {
  mode: "login" | "signup";
  /** The last result of accounts.login or accounts.signup, if the form was submitted. */
  result?: PublicResult<AccountView> | null;
  /** True while the form is being sent. */
  pending?: boolean;
  /** The form action. The shell passes a Server Action. A story passes a no-op. */
  action: (formData: FormData) => void | Promise<void>;
};

const TEXT = {
  login: { title: "Log in", button: "Log in", busy: "Logging in...", other: "/signup", otherText: "Create an account" },
  signup: { title: "Sign up", button: "Create account", busy: "Creating...", other: "/login", otherText: "I already have an account" },
} as const;

/** Receives Result-shaped props only. It does not import or call a strip. */
export function AuthForm({ mode, result = null, pending = false, action }: AuthFormProps) {
  const t = TEXT[mode];
  return (
    <form action={action} style={{ display: "grid", gap: 12, maxWidth: 360 }}>
      <h1>{t.title}</h1>
      <label style={{ display: "grid", gap: 4 }}>
        <span>Email</span>
        <input name="email" type="email" autoComplete="email" disabled={pending} maxLength={254} required />
      </label>
      <label style={{ display: "grid", gap: 4 }}>
        <span>Password</span>
        <input
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          disabled={pending}
          maxLength={200}
          required
        />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? t.busy : t.button}
      </button>
      {result && !result.ok ? <Toast display={result.display} /> : null}
      <a href={t.other}>{t.otherText}</a>
    </form>
  );
}
