import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { errResult, okResult } from "../../../../test-utils/fixtures.ts";
import { viewStateOf } from "../../../../shared/ui/view-state.ts";
import { SEED_PLANS } from "../../domain.ts";
import type { CurrentPlan } from "../../domain.ts";
import { BillingPanel } from "./BillingPanel.tsx";

const noop = () => {};
const available = SEED_PLANS.map((p) => ({ ...p, features: [...p.features] }));
const free: CurrentPlan = { plan: available[0]!, subscription: null, available };
const pro: CurrentPlan = { plan: available[1]!, subscription: { status: "active", reference: "fake_1", planId: "pro" }, available };

const meta = {
  title: "BillingPanel",
  component: BillingPanel,
  args: { action: noop, plan: viewStateOf(okResult(free)) },
} satisfies Meta<typeof BillingPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

// One story per end state of billing.plan, billing.checkout and billing.cancel.

export const Loading: Story = { args: { plan: { status: "loading" } } };

export const OnFreePlan: Story = {};

export const OnProPlan: Story = { args: { plan: viewStateOf(okResult(pro)) } };

export const NoPlans: Story = { args: { plan: { status: "empty" } } };

export const NotSignedIn: Story = {
  args: { plan: viewStateOf(errResult("unauthorized", "user", { userMessage: "You need to sign in, or send a valid API key." })) },
};

export const PlanInternalError: Story = { args: { plan: viewStateOf(errResult("not_found", "internal", { stripId: "strip-5e20" })) } };

export const Working: Story = { args: { pending: true } };

export const Cancelled: Story = { args: { last: okResult({ kind: "cancelled" as const }) } };

export const CheckoutUserError: Story = {
  args: { last: errResult("not_found", "user", { userMessage: "That plan does not exist." }) },
};

export const CheckoutInternalError: Story = {
  args: { last: errResult("upstream", "internal", { stripId: "strip-a812" }) },
};
