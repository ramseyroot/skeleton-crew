// defineStrip and the strip runner (plan section 8).
//
// A strip is an ordered chain of steps that implements one feature. Its file is its documentation:
// the budget (what it may touch), the routing (what happens to each failure), and what a write invalidates.
//
// Checked at compile time:  each step's output is assignable to the next step's input,
//                           `log-and-continue` only where the failed step's input fits the next step,
//                           routing keys are step names, `recover:` names a listed fallback.
// Checked when the module loads (throws, so `pnpm test` and `pnpm check` find it): the budget, the routing table,
//                           `invalidates` when a step writes, action syntax, duplicate step names.
// The runner itself never throws: it always returns a StripResult.

import type { Permissions, Ports, Step } from "./step.ts";
import { fromThrown } from "./result.ts";
import type { ErrorKind, StepError } from "./result.ts";

// ---------------------------------------------------------------------------
// Routing

export type BaseAction = "toast" | "abort" | "log-and-continue" | `retry:${number}`;
type Action<F extends string> = BaseAction | `recover:${F}`;
type KindRoute<A> = { [K in ErrorKind | "*"]?: A };

type AnyStep = Step<any, any, string>;
type Names<S extends readonly AnyStep[]> = S[number]["name"];

type InputOf<S> = S extends Step<infer I, unknown, string> ? I : never;
type OutputOf<S> = S extends Step<never, infer O, string> ? O : never;

/** Names of steps whose failure can be skipped: the failed step's input is a valid input for what comes next. */
type ContinuableNames<S extends readonly AnyStep[]> = S extends readonly [infer A, ...infer Rest]
  ? A extends Step<infer I, infer O, infer N>
    ?
        | (Rest extends readonly [infer B, ...unknown[]]
            ? [I] extends [InputOf<B>]
              ? N
              : never
            : [I] extends [O]
              ? N
              : never)
        | (Rest extends readonly AnyStep[] ? ContinuableNames<Rest> : never)
    : never
  : never;

type ActionFor<S extends readonly AnyStep[], N extends string, F extends string> = N extends ContinuableNames<S>
  ? Action<F>
  : Exclude<Action<F>, "log-and-continue">;

export type Routing<S extends readonly AnyStep[], F extends string> = {
  [N in Names<S>]?: ActionFor<S, N, F> | KindRoute<ActionFor<S, N, F>>;
} & {
  "*"?: Exclude<Action<F>, "log-and-continue"> | KindRoute<Exclude<Action<F>, "log-and-continue">>;
};

// ---------------------------------------------------------------------------
// Chain check

type ChainOk<S extends readonly unknown[]> = S extends readonly [infer A, infer B, ...infer Rest]
  ? [OutputOf<A>] extends [InputOf<B>]
    ? ChainOk<[B, ...Rest]>
    : false
  : true;

type ChainGuard<S extends readonly AnyStep[]> = ChainOk<S> extends true
  ? unknown
  : { "a step's output does not match the next step's input": never };

type FirstInput<S extends readonly AnyStep[]> = S extends readonly [infer A, ...unknown[]] ? InputOf<A> : never;
type LastOutput<S extends readonly AnyStep[]> = S extends readonly [...unknown[], infer Z] ? OutputOf<Z> : never;

// ---------------------------------------------------------------------------
// Definition and result types

export type StripDefinition<N extends string, S extends readonly AnyStep[], F extends readonly AnyStep[]> = {
  /** `<domain>.<verb>`, written as a literal so the checker can read it. */
  name: N;
  budget: Permissions;
  steps: S;
  /** Steps that run only through a `recover:<name>` route. They are not part of the chain. */
  fallbacks?: F;
  /** Cache keys a write makes stale. `{name}` is replaced from the strip input. Write `[]` when nothing is affected. */
  invalidates: readonly string[];
  routing: Routing<S, Names<F>>;
};

export type Display = { type: "toast"; message: string } | { type: "generic"; reference: string };

export type StripResult<T> =
  | { ok: true; value: T; stripId: string }
  | { ok: false; error: StepError; display: Display; stripId: string };

export type Strip<I, O, N extends string = string> = {
  readonly name: N;
  readonly budget: Permissions;
  readonly steps: readonly AnyStep[];
  readonly fallbacks: readonly AnyStep[];
  readonly invalidates: readonly string[];
  readonly routing: Readonly<Record<string, unknown>>;
  /** Phantom fields for the types of input and output. Never read. */
  readonly __types?: { input: I; output: O };
};

// ---------------------------------------------------------------------------
// defineStrip

const ACTION = /^(toast|abort|log-and-continue|retry:\d+|recover:.+)$/;

function matchGlob(value: string, glob: string): boolean {
  const re = glob
    .split("**")
    .map((part) => part.split("*").map(escape).join("[^/]*"))
    .join(".*");
  return new RegExp(`^${re}$`).test(value);
}
const escape = (s: string): string => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

function covers(category: keyof Permissions, budget: readonly string[], need: string): boolean {
  return budget.includes(need) || (category === "storage" && budget.some((b) => matchGlob(need, b)));
}

function fail(strip: string, message: string): never {
  throw new Error(`defineStrip "${strip}": ${message}`);
}

export function defineStrip<
  const N extends string,
  const S extends readonly [AnyStep, ...AnyStep[]],
  const F extends readonly AnyStep[] = readonly [],
>(def: StripDefinition<N, S, F> & ChainGuard<S>): Strip<FirstInput<S>, LastOutput<S>, N> {
  const name = def.name;
  const steps = def.steps as readonly AnyStep[];
  const fallbacks = (def.fallbacks ?? []) as readonly AnyStep[];
  if (steps.length === 0) fail(name, "a strip needs at least one step");

  const seen = new Set<string>();
  for (const s of [...steps, ...fallbacks]) {
    if (seen.has(s.name)) fail(name, `step "${s.name}" is listed twice`);
    seen.add(s.name);
  }

  // Budget: every step's permissions must be allowed by the strip's budget.
  for (const s of [...steps, ...fallbacks]) {
    for (const category of ["reads", "writes", "storage"] as const) {
      for (const need of s.manifest.permissions[category]) {
        if (!covers(category, def.budget[category], need)) {
          fail(name, `step "${s.name}" needs ${category}: ${need}, which the strip budget does not allow`);
        }
      }
    }
  }

  // Invalidates: required when a step writes (an empty list is an explicit answer).
  if (!Array.isArray(def.invalidates)) {
    const writer = steps.find((s) => writesData(s));
    if (writer) fail(name, `step "${writer.name}" writes, so \`invalidates\` is required (write [] if nothing is cached)`);
    fail(name, "`invalidates` must be a list (write [] if nothing is cached)");
  }

  // Routing: every step has an entry or "*" exists; keys are step names; actions are well formed.
  const routing = def.routing as Record<string, unknown>;
  if (typeof routing !== "object" || routing === null) fail(name, "`routing` is required");
  const stepNames = new Set(steps.map((s) => s.name));
  const fallbackNames = new Set(fallbacks.map((s) => s.name));
  for (const key of Object.keys(routing)) {
    if (key !== "*" && !stepNames.has(key)) fail(name, `routing names "${key}", which is not a step of this strip`);
  }
  if (!("*" in routing)) {
    const missing = steps.find((s) => !(s.name in routing));
    if (missing) fail(name, `step "${missing.name}" has no routing entry and there is no "*" entry`);
  }
  for (const [key, entry] of Object.entries(routing)) {
    const actions = typeof entry === "string" ? [entry] : Object.values((entry ?? {}) as Record<string, unknown>);
    for (const action of actions) {
      if (typeof action !== "string" || !ACTION.test(action)) fail(name, `routing for "${key}" has an invalid action: ${String(action)}`);
      if (action.startsWith("recover:") && !fallbackNames.has(action.slice("recover:".length))) {
        fail(name, `routing for "${key}" recovers with "${action.slice(8)}", which is not in \`fallbacks\``);
      }
    }
  }

  return { name, budget: def.budget, steps, fallbacks, invalidates: def.invalidates, routing };
}

/** A write to data (not to the cache) makes cached copies stale. */
function writesData(step: AnyStep): boolean {
  return step.manifest.permissions.writes.some((w) => !w.startsWith("cache:"));
}

// ---------------------------------------------------------------------------
// Runner

function parseAction(action: string): { kind: "toast" | "abort" | "continue" } | { kind: "retry"; n: number } | { kind: "recover"; step: string } {
  if (action === "toast" || action === "abort") return { kind: action };
  if (action === "log-and-continue") return { kind: "continue" };
  if (action.startsWith("retry:")) return { kind: "retry", n: Number(action.slice(6)) };
  return { kind: "recover", step: action.slice(8) };
}

function resolveAction(routing: Readonly<Record<string, unknown>>, step: string, kind: ErrorKind): string {
  const pick = (entry: unknown): string | undefined => {
    if (typeof entry === "string") return entry;
    if (entry !== null && typeof entry === "object") {
      const map = entry as Record<string, unknown>;
      const a = map[kind] ?? map["*"];
      return typeof a === "string" ? a : undefined;
    }
    return undefined;
  };
  return pick(routing[step]) ?? pick(routing["*"]) ?? "abort";
}

/** What the receiver shows. Only a `user` error may show its own message. Anything else gets the reference code. */
function displayFor(error: StepError, stripId: string): Display {
  if (error.audience === "user") return { type: "toast", message: error.userMessage };
  return { type: "generic", reference: stripId };
}

function resolvePlaceholders(template: string, input: unknown): { key: string } | { missing: string } {
  const source = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  let missing: string | null = null;
  const key = template.replace(/\{([A-Za-z0-9_]+)\}/g, (_m, field: string) => {
    const v = source[field];
    if (typeof v === "string" || typeof v === "number") return String(v);
    missing ??= field;
    return "";
  });
  return missing === null ? { key } : { missing };
}

export async function runStrip<I, O, N extends string>(
  strip: Strip<I, O, N>,
  ports: Ports,
  input: I,
): Promise<StripResult<O>> {
  let stripId = "";
  try {
    stripId = ports.ids.next();
  } catch (thrown) {
    const error = fromThrown(thrown, strip.name, "");
    return { ok: false, error, display: displayFor(error, ""), stripId: "" };
  }
  const started = performance.now();
  const base = { stripId, step: strip.name, class: "strip" };
  const log = (entry: Omit<Parameters<Ports["logger"]["log"]>[0], "stripId" | "step" | "class">): void => {
    try {
      ports.logger.log({ ...base, ...entry });
    } catch {
      // A logger must never fail a strip.
    }
  };
  const finish = (result: StripResult<O>): StripResult<O> => {
    const ms = Math.round(performance.now() - started);
    if (result.ok) log({ phase: "end", ok: true, ms });
    else log({ phase: "end", ok: false, ms, error: { kind: result.error.kind, audience: result.error.audience, message: result.error.message } });
    return result;
  };
  const abort = (error: StepError): StripResult<O> => finish({ ok: false, error, display: displayFor(error, stripId), stripId });

  log({ phase: "start", input });

  try {
    let value: unknown = input;
    for (const step of strip.steps) {
      let attempts = 0;
      for (;;) {
        const result = await step.execute(value, { stripId, ports });
        if (result.ok) {
          value = result.value;
          break;
        }
        const action = parseAction(resolveAction(strip.routing, step.name, result.error.kind));

        if (action.kind === "retry") {
          if (result.error.retryable && attempts < action.n) {
            attempts += 1;
            log({ phase: "debug", message: `retry ${attempts} of ${action.n} for ${step.name} after ${result.error.kind}` });
            continue;
          }
          return abort(result.error);
        }
        if (action.kind === "continue") {
          log({ phase: "debug", message: `${step.name} failed with ${result.error.kind}; continuing with its input` });
          break;
        }
        if (action.kind === "recover") {
          const fallback = strip.fallbacks.find((f) => f.name === action.step);
          if (!fallback) return abort(result.error);
          log({ phase: "debug", message: `${step.name} failed with ${result.error.kind}; recovering with ${fallback.name}` });
          const recovered = await fallback.execute(value, { stripId, ports });
          if (!recovered.ok) return abort(recovered.error);
          value = recovered.value;
          break;
        }
        // toast and abort
        return abort(result.error);
      }
    }

    if (strip.steps.some(writesData)) await invalidate(strip, ports, input, log);
    return finish({ ok: true, value: value as O, stripId });
  } catch (thrown) {
    return abort(fromThrown(thrown, strip.name, stripId));
  }
}

async function invalidate(
  strip: Strip<unknown, unknown>,
  ports: Ports,
  input: unknown,
  log: (entry: { phase: "debug"; message: string; error?: { kind: ErrorKind; audience: "internal"; message: string } }) => void,
): Promise<void> {
  for (const template of strip.invalidates) {
    const resolved = resolvePlaceholders(template, input);
    if ("missing" in resolved) {
      log({
        phase: "debug",
        message: `invalidation key "${template}" skipped`,
        error: { kind: "validation", audience: "internal", message: `no value for {${resolved.missing}} in the strip input` },
      });
      continue;
    }
    const deleted = await ports.cache.delete(resolved.key);
    if (!deleted.ok) {
      log({
        phase: "debug",
        message: `invalidation of "${resolved.key}" failed`,
        error: { kind: deleted.error.kind, audience: "internal", message: deleted.error.message },
      });
    }
  }
}
