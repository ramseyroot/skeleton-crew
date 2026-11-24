import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { errResult, okResult } from "../../../../test-utils/fixtures.ts";
import { viewStateOf } from "../../../../shared/ui/view-state.ts";
import type { KeyRow } from "../../domain.ts";
import { KeysPortal } from "./KeysPortal.tsx";

const noop = () => {};

const rows: KeyRow[] = [
  { id: "k2", name: "Production server", prefix: "a1b2c3d4", createdAt: "2026-11-20T10:00:00.000Z", lastUsedAt: "2026-11-24T08:30:00.000Z", expiresAt: null, revokedAt: null, state: "active" },
  { id: "k1", name: "Old laptop", prefix: "e5f6a7b8", createdAt: "2026-10-01T10:00:00.000Z", lastUsedAt: null, expiresAt: null, revokedAt: "2026-11-01T09:00:00.000Z", state: "revoked" },
];
const newKey = {
  id: "k3", name: "CI", prefix: "9z8y7x6w", key: "sk_9z8y7x6w_0123456789abcdef0123456789abcdef0123456789abcdef",
  createdAt: "2026-11-24T09:00:00.000Z", expiresAt: null,
};

const meta = {
  title: "KeysPortal",
  component: KeysPortal,
  args: { action: noop, keys: viewStateOf(okResult({ keys: rows })) },
} satisfies Meta<typeof KeysPortal>;
export default meta;
type Story = StoryObj<typeof meta>;

// One story per end state of keys.list, keys.create, keys.rotate and keys.revoke.

export const Loading: Story = { args: { keys: { status: "loading" } } };

export const WithKeys: Story = {};

export const Empty: Story = { args: { keys: { status: "empty" } } };

export const NotSignedIn: Story = {
  args: { keys: viewStateOf(errResult("unauthorized", "user", { userMessage: "You need to sign in, or send a valid API key." })) },
};

export const ListInternalError: Story = {
  args: { keys: viewStateOf(errResult("unexpected", "internal", { stripId: "strip-3c19" })) },
};

export const Working: Story = { args: { pending: true } };

export const Created: Story = { args: { last: okResult({ kind: "created" as const, key: newKey }) } };

export const Rotated: Story = { args: { last: okResult({ kind: "rotated" as const, key: newKey, replacedId: "k2" }) } };

export const Revoked: Story = { args: { last: okResult({ kind: "revoked" as const, id: "k2" }) } };

export const CreateUserError: Story = {
  args: { last: errResult("validation", "user", { userMessage: "Give the key a name of 1 to 60 characters." }) },
};

export const RotateNotActive: Story = {
  args: { last: errResult("conflict", "user", { userMessage: "Only an active key can be rotated. Create a new key instead." }) },
};

export const ActionInternalError: Story = {
  args: { last: errResult("unexpected", "internal", { stripId: "strip-b207" }) },
};
