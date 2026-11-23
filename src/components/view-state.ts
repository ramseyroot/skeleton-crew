// What a component shows, derived from a StripResult. Components receive this, never a strip (plan section 14).

import type { Display, StripResult } from "../lib/strip.ts";

export type ViewState<T> =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; value: T }
  | { status: "error"; display: Display; stripId: string };

/** Turns a strip result into a view state. `isEmpty` decides when a successful value counts as "nothing to show". */
export function viewStateOf<T>(result: StripResult<T>, isEmpty: (value: T) => boolean = () => false): ViewState<T> {
  if (!result.ok) return { status: "error", display: result.display, stripId: result.stripId };
  return isEmpty(result.value) ? { status: "empty" } : { status: "ready", value: result.value };
}

/** The text a user sees for a failed result. Internal errors never show their own message. */
export function displayText(display: Display): string {
  return display.type === "toast"
    ? display.message
    : `Something went wrong on our side. Please try again. Reference: ${display.reference}`;
}
