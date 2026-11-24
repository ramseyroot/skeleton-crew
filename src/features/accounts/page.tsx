import { AuthEditor } from "./ui/AuthEditor.tsx";

// Two pages in one file, because a route stub may import only this file (rule R42). Each stub re-exports one of them.

export function LoginPage() {
  return (
    <main>
      <AuthEditor mode="login" />
    </main>
  );
}

export function SignupPage() {
  return (
    <main>
      <AuthEditor mode="signup" />
    </main>
  );
}
