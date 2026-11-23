import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { errResult, okResult } from "../../test-utils/fixtures.ts";
import { viewStateOf } from "../../shared/ui/view-state.ts";
import { ProfileForm } from "./ProfileForm.tsx";

const ada = { userId: "u1", displayName: "Ada" };
const noop = () => {};

const meta = {
  title: "ProfileForm",
  component: ProfileForm,
  args: { action: noop, profile: viewStateOf(okResult(ada)) },
} satisfies Meta<typeof ProfileForm>;
export default meta;
type Story = StoryObj<typeof meta>;

// One story per end state of profile.view and profile.save.

export const Loading: Story = { args: { profile: { status: "loading" } } };

export const Success: Story = {};

export const Empty: Story = { args: { profile: { status: "empty" } } };

export const ViewInternalError: Story = {
  args: { profile: viewStateOf(errResult("not_found", "internal", { stripId: "strip-91c2", step: "db.user.findProfile" })) },
};

export const Saving: Story = { args: { pending: true } };

export const Saved: Story = { args: { saved: okResult({ userId: "u1", displayName: "Ada L." }) } };

export const SaveUserError: Story = {
  args: { saved: errResult("conflict", "user", { userMessage: "That name is taken. Please choose another." }) },
};

export const SaveInternalError: Story = {
  args: { saved: errResult("unexpected", "internal", { stripId: "strip-4d10" }) },
};
