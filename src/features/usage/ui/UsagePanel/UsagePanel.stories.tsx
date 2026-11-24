import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { errResult, okResult } from "../../../../test-utils/fixtures.ts";
import { viewStateOf } from "../../../../shared/ui/view-state.ts";
import { UsagePanel } from "./UsagePanel.tsx";

const meta = {
  title: "UsagePanel",
  component: UsagePanel,
  args: {
    usage: viewStateOf(
      okResult({
        month: "2026-11",
        total: 141,
        byEndpoint: [
          { endpoint: "drugs.search", ok: 120, clientError: 6, serverError: 0, total: 126 },
          { endpoint: "me.get", ok: 14, clientError: 1, serverError: 0, total: 15 },
        ],
      }),
    ),
  },
} satisfies Meta<typeof UsagePanel>;
export default meta;
type Story = StoryObj<typeof meta>;

// One story per end state of usage.month.

export const Loading: Story = { args: { usage: { status: "loading" } } };

export const WithUsage: Story = {};

export const NoRequestsYet: Story = { args: { usage: { status: "empty" } } };

export const NotSignedIn: Story = {
  args: { usage: viewStateOf(errResult("unauthorized", "user", { userMessage: "You need to sign in, or send a valid API key." })) },
};

export const InternalError: Story = { args: { usage: viewStateOf(errResult("unexpected", "internal", { stripId: "strip-2f4e" })) } };
