// Contract suite for the ErrorReporter port. `observed` is missing for adapters that keep nothing (none).

import assert from "node:assert/strict";
import { test } from "node:test";
import { makeError } from "../../lib/result.ts";
import type { ErrorReporter } from "../../ports/reporter.ts";
import { shouldReport } from "../../ports/reporter.ts";

export type Observed = { kind: string; step: string; stripId: string; strip: string; message?: string };
export type ReporterHarness = { reporter: ErrorReporter; observed?: () => Observed[] };
export type MakeReporter = (env: string) => ReporterHarness;

const boom = makeError("unexpected", "db.user.setDisplayName", "strip-7", "connection string postgres://secret");
const context = { strip: "profile.save", stripId: "strip-7", env: "local" };

export function runReporterContract(name: string, make: MakeReporter, options: { redactsInProd?: boolean } = {}): void {
  test(`${name}: report returns nothing and never throws, whatever it is given`, () => {
    const { reporter } = make("local");
    assert.equal(reporter.report(boom, context), undefined);
    assert.doesNotThrow(() => reporter.report(makeError("network", "", "", ""), { strip: "", stripId: "", env: "" }));
    assert.doesNotThrow(() => reporter.report(makeError("upstream", "a.b.c", "s", "x".repeat(100_000)), context));
    assert.doesNotThrow(() => reporter.report(null as never, null as never));
  });

  test(`${name}: what it keeps names the kind, step, strip and reference`, (t) => {
    const { reporter, observed } = make("local");
    if (!observed) return t.skip("this adapter keeps nothing");
    reporter.report(boom, context);
    assert.deepEqual(observed().map(({ kind, step, stripId, strip }) => ({ kind, step, stripId, strip })), [
      { kind: "unexpected", step: "db.user.setDisplayName", stripId: "strip-7", strip: "profile.save" },
    ]);
  });

  test(`${name}: one entry per report, in order`, (t) => {
    const { reporter, observed } = make("local");
    if (!observed) return t.skip("this adapter keeps nothing");
    reporter.report(boom, context);
    reporter.report(makeError("upstream", "api.pay.charge", "strip-8", "502"), { ...context, stripId: "strip-8" });
    assert.deepEqual(observed().map((o) => o.kind), ["unexpected", "upstream"]);
  });

  if (options.redactsInProd) {
    test(`${name}: in prod the message text is dropped and the kind stays`, (t) => {
      const { reporter, observed } = make("prod");
      if (!observed) return t.skip("this adapter keeps nothing");
      reporter.report(boom, { ...context, env: "prod" });
      const [entry] = observed();
      assert.equal(entry?.kind, "unexpected");
      assert.equal(entry?.message, undefined);
      assert.equal(JSON.stringify(entry).includes("secret"), false);
    });
  }
}

export function reportedKindsCases(): void {
  test("shouldReport: only internal errors of kinds that mean something is broken", () => {
    for (const kind of ["unexpected", "upstream", "network"] as const) {
      assert.equal(shouldReport(makeError(kind, "a.b.c", "s", "m")), true, kind);
    }
    for (const kind of ["not_found", "conflict", "validation", "forbidden", "unauthorized", "rate_limited"] as const) {
      assert.equal(shouldReport(makeError(kind, "a.b.c", "s", "m")), false, kind);
    }
    assert.equal(shouldReport(makeError("network", "a.b.c", "s", "m", { audience: "user", userMessage: "Try again" })), false);
  });
}
