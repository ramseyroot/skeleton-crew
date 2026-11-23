import { violation, type Rule, type Value, type Violation } from "../types.ts";

type Want = "string" | "strings" | { [key: string]: "strings" } | "routing";

const STEP: Record<string, Want> = {
  name: "string",
  class: "string",
  permissions: { reads: "strings", writes: "strings", storage: "strings" },
  errors: "strings",
};

const STRIP: Record<string, Want> = {
  name: "string",
  budget: { reads: "strings", writes: "strings", storage: "strings" },
  invalidates: "strings",
  routing: "routing",
};

const shown = (v: Value): string => (v.kind === "expr" ? v.text : v.kind === "identifiers" ? `[${v.value.join(", ")}]` : v.kind);

function checkFields(props: Record<string, Value>, want: Record<string, Want>): Array<{ field: string; line: number; found: string }> {
  const bad: Array<{ field: string; line: number; found: string }> = [];
  for (const [field, w] of Object.entries(want)) {
    const v = props[field];
    if (!v) continue; // missing fields are other rules' concern
    if (w === "string" || w === "strings") {
      if (v.kind !== w) bad.push({ field, line: v.line, found: shown(v) });
    } else if (w === "routing") {
      if (v.kind !== "object") {
        bad.push({ field, line: v.line, found: shown(v) });
        continue;
      }
      for (const [key, rv] of Object.entries(v.props)) {
        if (rv.kind === "string") continue;
        if (rv.kind === "object") {
          for (const [k2, v2] of Object.entries(rv.props)) {
            if (v2.kind !== "string") bad.push({ field: `${field}["${key}"].${k2}`, line: v2.line, found: shown(v2) });
          }
        } else {
          bad.push({ field: `${field}["${key}"]`, line: rv.line, found: shown(rv) });
        }
      }
    } else {
      if (v.kind !== "object") {
        bad.push({ field, line: v.line, found: shown(v) });
        continue;
      }
      for (const k of Object.keys(w)) {
        const inner = v.props[k];
        if (inner && inner.kind !== "strings") bad.push({ field: `${field}.${k}`, line: inner.line, found: shown(inner) });
      }
    }
  }
  return bad;
}

export const R11: Rule = {
  id: "R11",
  name: "manifest-static",
  severity: "error",
  needs: ["steps"],
  scope: "file",
  check(ctx) {
    const out: Violation[] = [];
    const items = [
      ...ctx.steps.map((s) => ({ kind: "step", item: s, want: STEP })),
      ...ctx.strips.map((s) => ({ kind: "strip", item: s, want: STRIP })),
    ];
    for (const { kind, item, want } of items) {
      for (const b of checkFields(item.props, want)) {
        const label = item.name ?? item.exportName ?? "(unnamed)";
        out.push(
          violation(R11, item.file, b.line, `${kind} "${label}": ${b.field} must be written as a literal so it can be checked without running code (found ${b.found})`, item.name ?? undefined),
        );
      }
    }
    return out;
  },
};
