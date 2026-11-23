// Every adapter has an errors.ts built with this helper: a table from provider failures to ErrorKind.
// The table is data, so a contract test can trigger each provider failure and check the kind it maps to.

import type { ErrorKind } from "./result.ts";

export type ErrorRule = {
  /** Short label for test output, for example "sqlite unique constraint". */
  name: string;
  when: (thrown: unknown) => boolean;
  kind: ErrorKind;
};

export type ErrorMap = {
  rules: readonly ErrorRule[];
  fallback: ErrorKind;
  /** First matching rule wins. Anything unmatched maps to the fallback. */
  map: (thrown: unknown) => ErrorKind;
};

export function createErrorMap(rules: readonly ErrorRule[], fallback: ErrorKind = "unexpected"): ErrorMap {
  return {
    rules,
    fallback,
    map(thrown) {
      for (const rule of rules) {
        let matched = false;
        try {
          matched = rule.when(thrown);
        } catch {
          matched = false;
        }
        if (matched) return rule.kind;
      }
      return fallback;
    },
  };
}
