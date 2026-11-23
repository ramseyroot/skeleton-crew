// What a component shows, derived from a StripResult. Components receive this, never a strip (plan section 14).

import type { Display, StripResult } from "../lib/strip.ts";

/**
 * What may cross to the browser: the display and the reference, never the StepError.
 * `error.message` is for logs only and can hold internal detail, so the browser must not receive it.
 */
export type PublicResult<T> =
  | { ok: true; value: T; stripId: string }
  | { ok: false; display: Display; stripId: string };

export function toPublicResult<T>(result: StripResult<T>): PublicResult<T> {
  return result.ok
    ? { ok: true, value: result.value, stripId: result.stripId }
    : { ok: false, display: result.display, stripId: result.stripId };
}

export type ViewState<T> =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; value: T }
  | { status: "error"; display: Display; stripId: string };

/** Turns a strip result into a view state. `isEmpty` decides when a successful value counts as "nothing to show". */
export function viewStateOf<T>(result: PublicResult<T>, isEmpty: (value: T) => boolean = () => false): ViewState<T> {
  if (!result.ok) return { status: "error", display: result.display, stripId: result.stripId };
  return isEmpty(result.value) ? { status: "empty" } : { status: "ready", value: result.value };
}

/** The text a user sees for a failed result. Internal errors never show their own message. */
export function displayText(display: Display): string {
  return display.type === "toast"
    ? display.message
    : `Something went wrong on our side. Please try again. Reference: ${display.reference}`;
}
