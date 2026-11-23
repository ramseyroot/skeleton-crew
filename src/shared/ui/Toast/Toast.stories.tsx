import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { errResult } from "../../../test-utils/fixtures.ts";
import { Toast } from "./Toast.tsx";

const meta = { title: "Toast", component: Toast } satisfies Meta<typeof Toast>;
export default meta;
type Story = StoryObj<typeof meta>;

const failed = (r: ReturnType<typeof errResult>) => (r.ok ? { type: "generic" as const, reference: "" } : r.display);

export const UserError: Story = {
  args: { display: failed(errResult("conflict", "user", { userMessage: "That name is taken. Please choose another." })) },
};

export const InternalErrorWithReference: Story = {
  args: { display: failed(errResult("unexpected", "internal", { stripId: "strip-7f3a" })) },
};

export const LongMessage: Story = {
  args: {
    display: failed(
      errResult("validation", "user", {
        userMessage:
          "Your display name must be between 1 and 60 characters and cannot be made of spaces alone. Names that are already used by someone else, in any combination of upper and lower case letters, are not allowed either, so try adding a middle initial or a number.",
      }),
    ),
  },
};

export const LongUnbrokenText: Story = {
  args: { display: { type: "toast", message: "x".repeat(300) } },
};
