import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { errResult } from "../../../../test-utils/fixtures.ts";
import { AuthForm } from "./AuthForm.tsx";

const noop = () => {};

const meta = {
  title: "AuthForm",
  component: AuthForm,
  args: { action: noop, mode: "login" },
} satisfies Meta<typeof AuthForm>;
export default meta;
type Story = StoryObj<typeof meta>;

// One story per end state of accounts.login and accounts.signup.

export const LoginIdle: Story = {};

export const LoginPending: Story = { args: { pending: true } };

export const LoginWrongPassword: Story = {
  args: { result: errResult("unauthorized", "user", { userMessage: "Email or password is wrong." }) },
};

export const LoginInternalError: Story = {
  args: { result: errResult("unexpected", "internal", { stripId: "strip-7a31" }) },
};

export const SignupIdle: Story = { args: { mode: "signup" } };

export const SignupPending: Story = { args: { mode: "signup", pending: true } };

export const SignupEmailTaken: Story = {
  args: { mode: "signup", result: errResult("conflict", "user", { userMessage: "An account with that email already exists." }) },
};

export const SignupWeakPassword: Story = {
  args: { mode: "signup", result: errResult("validation", "user", { userMessage: "Use at least 10 characters for your password." }) },
};

export const SignupInternalError: Story = {
  args: { mode: "signup", result: errResult("unexpected", "internal", { stripId: "strip-90bd" }) },
};
