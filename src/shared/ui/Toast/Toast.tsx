"use client";

import type { Display } from "../../../lib/strip.ts";
import { displayText } from "../view-state.ts";

/** Shows a strip failure to the user. Receives the strip's `display`, never an error object. */
export function Toast({ display }: { display: Display }) {
  return (
    <div
      role="alert"
      data-kind={display.type}
      style={{
        maxWidth: 420,
        padding: "10px 14px",
        borderRadius: 6,
        border: "1px solid #b42318",
        background: "#fef3f2",
        color: "#7a271a",
        overflowWrap: "anywhere",
      }}
    >
      {displayText(display)}
    </div>
  );
}
