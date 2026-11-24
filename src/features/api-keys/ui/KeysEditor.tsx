"use client";

import { useActionState } from "react";
import type { KeyRow } from "../domain.ts";
import { KeysPortal } from "./KeysPortal/KeysPortal.tsx";
import type { PublicResult, ViewState } from "../../../shared/ui/view-state.ts";
import { keyAction } from "../actions.ts";
import type { KeyOutcome } from "../portal.ts";

/** Connects the portal to the Server Action. All presentation stays in KeysPortal, which Storybook shows. */
export function KeysEditor({ keys }: { keys: ViewState<{ keys: KeyRow[] }> }) {
  const [last, action, pending] = useActionState<PublicResult<KeyOutcome> | null, FormData>(keyAction, null);
  return <KeysPortal keys={keys} last={last} pending={pending} action={action} />;
}
