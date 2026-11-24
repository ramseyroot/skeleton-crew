import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { errResult } from "../../../../test-utils/fixtures.ts";
import { FakeCheckout } from "./FakeCheckout.tsx";

const meta = {
  title: "FakeCheckout",
  component: FakeCheckout,
  args: { action: () => {}, reference: "fake_pay-1" },
} satisfies Meta<typeof FakeCheckout>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const Working: Story = { args: { pending: true } };

export const NoReference: Story = { args: { reference: "" } };

export const UnknownCheckout: Story = {
  args: { last: errResult("not_found", "user", { userMessage: "That checkout does not exist." }) },
};

export const WebhookInternalError: Story = {
  args: { last: errResult("unexpected", "internal", { stripId: "strip-77c0" }) },
};
