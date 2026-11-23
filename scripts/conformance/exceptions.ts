// Loads the exceptions file and applies it to violations.
// Inline disable comments are not supported anywhere (requirement 9.1).

import { matchGlob, readRel } from "./project.ts";
import type { Exception, ExceptionResult, Violation } from "./types.ts";

export const EXCEPTIONS_FILE = "conformance.exceptions.json";

export type ExceptionsLoad = { raw: unknown[]; error: string | null };

export function loadExceptions(root: string): ExceptionsLoad {
  const text = readRel(root, EXCEPTIONS_FILE);
  if (text === null) return { raw: [], error: null };
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return { raw: [], error: `${EXCEPTIONS_FILE} must contain a JSON list` };
    return { raw: parsed, error: null };
  } catch (e) {
    return { raw: [], error: `${EXCEPTIONS_FILE} is not valid JSON (${e instanceof Error ? e.message : "parse error"})` };
  }
}

/** True when an entry has every field as a non-empty string. Malformed entries never match (R29 reports them). */
export function isWellFormed(e: unknown): e is Exception {
  if (typeof e !== "object" || e === null) return false;
  const r = e as Record<string, unknown>;
  return ["rule", "target", "reason", "date"].every((k) => typeof r[k] === "string" && (r[k] as string).trim() !== "");
}

function matches(e: Exception, v: Violation): boolean {
  if (e.rule !== v.rule && e.rule !== v.name) return false;
  if (v.target !== undefined && e.target === v.target) return true;
  return e.target === v.file || matchGlob(v.file, e.target);
}

/** Splits violations into kept and excepted. */
export function applyExceptions(raw: unknown[], violations: Violation[]): { kept: Violation[]; result: ExceptionResult } {
  const entries = raw.filter(isWellFormed);
  const hits = new Map<Exception, Violation[]>(entries.map((e) => [e, []]));
  const kept: Violation[] = [];
  for (const v of violations) {
    const e = entries.find((x) => matches(x, v));
    if (e) (hits.get(e) as Violation[]).push(v);
    else kept.push(v);
  }
  const used: ExceptionResult["used"] = [];
  const unused: Exception[] = [];
  for (const [exception, vs] of hits) {
    if (vs.length > 0) used.push({ exception, violations: vs });
    else unused.push(exception);
  }
  return { kept, result: { raw, used, unused } };
}
