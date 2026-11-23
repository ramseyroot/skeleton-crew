// Shared types for the conformance script.

import type { Config } from "./config.ts";

export type Severity = "error" | "warning";

/** Parts of the project a rule needs. A rule whose needs are missing is reported as not-applicable. */
export type Need =
  | "steps"
  | "strips"
  | "ports"
  | "profiles"
  | "catalog"
  | "git"
  | "coverage"
  | "steering"
  | "specs";

export type Violation = {
  rule: string; // "R01"
  name: string; // "no-console"
  severity: Severity;
  file: string; // repo-relative, forward slashes
  line: number; // 1-based, 0 when the violation is about a whole file or folder
  message: string; // one line
  target?: string; // step or strip name, used for exception matching
};

/** A value found in a defineStep() or defineStrip() object literal. */
export type Value =
  | { kind: "string"; value: string; line: number }
  | { kind: "strings"; value: string[]; line: number }
  | { kind: "identifiers"; value: string[]; line: number }
  | { kind: "object"; props: Record<string, Value>; line: number }
  | { kind: "expr"; text: string; line: number };

export type StepInfo = {
  file: string;
  line: number;
  exportName: string | null;
  props: Record<string, Value>;
  /** The literal name, or null when missing or not a literal. */
  name: string | null;
};

export type StepRef = { text: string; line: number; step: StepInfo | null };

export type StripInfo = {
  file: string;
  line: number;
  exportName: string | null;
  props: Record<string, Value>;
  name: string | null;
  /** Entries of the `steps` array, resolved to their defineStep() declarations where possible. */
  stepRefs: StepRef[];
};

export type AdapterInfo = { port: string; provider: string; dir: string; files: string[] };

export type PortInfo = { name: string; file: string };

export type Exception = { rule: string; target: string; reason: string; date: string };

export type ExceptionResult = {
  /** Entries in the exceptions file, as parsed (possibly malformed). */
  raw: unknown[];
  /** Well-formed entries that matched at least one violation. */
  used: Array<{ exception: Exception; violations: Violation[] }>;
  /** Well-formed entries that matched nothing. */
  unused: Exception[];
};

export type Context = {
  root: string;
  config: Config;
  /** Repo-relative source files under config.sourceRoots (.ts and .tsx, no .d.ts). */
  files: string[];
  /** Repo-relative files given with --files, or null for a full run. */
  scope: Set<string> | null;
  has: Set<Need>;
  steps: StepInfo[];
  strips: StripInfo[];
  ports: PortInfo[];
  adapters: AdapterInfo[];
  /** Reads a repo-relative file, or null if it does not exist. */
  read(file: string): string | null;
  /** Set only for rules with phase "post". */
  exceptions?: ExceptionResult;
};

export type Rule = {
  id: string; // "R01"
  name: string; // "no-console"
  severity: Severity;
  needs: Need[];
  /**
   * "file": violations are tied to one file, and a --files run reports only those files.
   * "project": the rule looks across files, and always reports everything.
   */
  scope: "file" | "project";
  /** "post" rules run after exceptions are applied (used by the exception rules). */
  phase?: "main" | "post";
  check(ctx: Context): Violation[];
};

export const DOCS_FILE = "docs/conformance-rules.md";

/** The anchor of a rule's section in the rules document, for example "r01-no-console". */
export function docsAnchor(rule: Pick<Rule, "id" | "name">): string {
  return `${rule.id.toLowerCase()}-${rule.name}`;
}

/** Builds a violation with the rule's id, name, severity, and a docs pointer appended to the message. */
export function violation(
  rule: Pick<Rule, "id" | "name" | "severity">,
  file: string,
  line: number,
  message: string,
  target?: string,
): Violation {
  const v: Violation = {
    rule: rule.id,
    name: rule.name,
    severity: rule.severity,
    file,
    line,
    message: `${message} (see ${DOCS_FILE}#${docsAnchor(rule)})`,
  };
  if (target !== undefined) v.target = target;
  return v;
}
