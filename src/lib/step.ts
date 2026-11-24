// defineStep and the step wrapper (plan sections 5 and 7).
//
// Every step is declared with a manifest and runs through one wrapper that:
//   1. logs entry,
//   2. parses the input with its schema,
//   3. runs the function inside try/catch,
//   4. parses the output with its schema,
//   5. logs exit, and returns a Result. It never throws.
//
// The step's context (`ctx`) contains only the ports named in `uses`, each narrowed to what the step's
// permissions allow. A step that declares `writes: []` has no write method to call.
//
// Permission strings:
//   - database collections:  "users"
//   - cache namespaces:      "cache:profile"   (allows keys that start with "profile:")
//   - storage prefixes:      "avatars/" in `storage` (read and write)

import type { z, ZodType } from "zod";
import type { Cache } from "../ports/cache.ts";
import type { Clock } from "../ports/clock.ts";
import type { BatchOp, Database, DbReader, DbWriter, Scalar } from "../ports/database.ts";
import type { IdGenerator } from "../ports/ids.ts";
import type { Logger } from "../ports/logger.ts";
import type { Metrics } from "../ports/metrics.ts";
import type { ErrorReporter } from "../ports/reporter.ts";
import type { ObjectStorage } from "../ports/storage.ts";
import { isPortError } from "./port-error.ts";
import { err, fromThrown, makeError, ok } from "./result.ts";
import type { ErrorKind, Result, StepError } from "./result.ts";

export type StepClass = "pure" | "api" | "db" | "cache" | "storage" | "ui" | "scrape";
export type PortName = "database" | "cache" | "storage" | "clock" | "ids";

export type Permissions = {
  reads: readonly string[];
  writes: readonly string[];
  storage: readonly string[];
};

/** The real ports of a running app, built from the active profile by `config/compose.ts`. */
export type Ports = {
  /** The profile's environment name: local, dev or prod. Only the runner reads it (for report context). */
  env: string;
  database: Database;
  cache: Cache;
  storage: ObjectStorage;
  clock: Clock;
  ids: IdGenerator;
  logger: Logger;
  /** Used by the step wrapper and the strip runner only. Steps never receive it. */
  reporter: ErrorReporter;
  metrics: Metrics;
};

/** What the strip runner (or a test) gives a step each time it runs. */
export type RunContext = { stripId: string; ports: Ports };

// ---------------------------------------------------------------------------
// Types of the narrowed context

type CachePrefix = `cache:${string}`;
type NotCache<S extends string> = Exclude<S, CachePrefix>;
type CollectionsRead<P extends Permissions> = NotCache<P["reads"][number]> | NotCache<P["writes"][number]>;
type CollectionsWrite<P extends Permissions> = NotCache<P["writes"][number]>;
type CacheReads<P extends Permissions> = Extract<P["reads"][number] | P["writes"][number], CachePrefix>;
type CacheWrites<P extends Permissions> = Extract<P["writes"][number], CachePrefix>;

type IfAny<T, Then, Else> = [T] extends [never] ? Else : Then;

type Empty = Record<never, never>;

export type DatabaseCtx<P extends Permissions> = {
  read(collection: CollectionsRead<P>): DbReader;
} & IfAny<
  CollectionsWrite<P>,
  { write(collection: CollectionsWrite<P>): DbWriter; batch(ops: BatchOp[]): Promise<Result<void>> },
  Empty
>;

export type CacheCtx<P extends Permissions> = IfAny<CacheReads<P>, Pick<Cache, "get">, Empty> &
  IfAny<CacheWrites<P>, Pick<Cache, "set" | "delete" | "deleteByPrefix">, Empty>;

export type StorageCtx<P extends Permissions> = IfAny<P["storage"][number], Omit<ObjectStorage, "name">, Empty>;

export type StepLog = { debug(message: string): void };

export type StepCtx<U extends readonly PortName[], P extends Permissions> = {
  stripId: string;
  log: StepLog;
} & ("database" extends U[number] ? { database: DatabaseCtx<P> } : Empty) &
  ("cache" extends U[number] ? { cache: CacheCtx<P> } : Empty) &
  ("storage" extends U[number] ? { storage: StorageCtx<P> } : Empty) &
  ("clock" extends U[number] ? { clock: Clock } : Empty) &
  ("ids" extends U[number] ? { ids: IdGenerator } : Empty);

// ---------------------------------------------------------------------------
// Manifest and step object

export type StepManifest = {
  name: string;
  class: StepClass;
  permissions: Permissions;
  errors: readonly ErrorKind[];
  uses: readonly PortName[];
  /** True when the step handles secrets (passwords, tokens, keys): nothing it receives or returns is logged. */
  sensitive: boolean;
};

export type Step<I, O, N extends string = string> = {
  readonly name: N;
  readonly manifest: StepManifest;
  readonly input: ZodType;
  readonly output: ZodType;
  /** Runs the step. Never throws. */
  execute(input: I, run: RunContext): Promise<Result<O>>;
};

export type AnyStep = Step<never, unknown>;

export type StepInput<S> = S extends Step<infer I, unknown, string> ? I : never;
export type StepOutput<S> = S extends Step<never, infer O, string> ? O : never;

export type StepDefinition<
  N extends string,
  In extends ZodType,
  Out extends ZodType,
  P extends Permissions,
  U extends readonly PortName[],
  E extends readonly ErrorKind[],
> = {
  /** `<class>.<domain>.<verb>`, written as a literal so the checker can read it. */
  name: N;
  class: StepClass;
  input: In;
  output: Out;
  permissions: P;
  errors: E;
  /** The ports this step needs. Defaults to none. */
  uses?: U;
  /**
   * Set to true for a step that handles passwords, tokens or keys. Its input, its output and its error text are
   * then never logged, in any environment. Only names, timing and the error kind are.
   */
  sensitive?: boolean;
  /**
   * The function. It returns a value, or a `Result` when it has expected failures.
   * An output that is itself shaped like a Result (`{ ok, value | error }`) is not supported.
   */
  run: (
    input: z.output<In>,
    ctx: StepCtx<U, P>,
  ) => Promise<Result<z.input<Out>> | z.input<Out>> | Result<z.input<Out>> | z.input<Out>;
};

export function defineStep<
  const N extends string,
  In extends ZodType,
  Out extends ZodType,
  const P extends Permissions,
  const E extends readonly ErrorKind[],
  const U extends readonly PortName[] = readonly [],
>(def: StepDefinition<N, In, Out, P, U, E>): Step<z.input<In>, z.output<Out>, N> {
  const manifest: StepManifest = {
    name: def.name,
    class: def.class,
    permissions: def.permissions,
    errors: def.errors,
    uses: def.uses ?? [],
    sensitive: def.sensitive === true,
  };
  const declared = new Set<ErrorKind>([...def.errors, "validation", "unexpected"]);

  return {
    name: def.name,
    manifest,
    input: def.input,
    output: def.output,
    async execute(input, run) {
      const started = performance.now();
      const base = { stripId: run.stripId, step: def.name, class: def.class };
      const safeLog = (entry: Parameters<Logger["log"]>[0]): void => {
        try {
          run.ports.logger.log(entry);
        } catch {
          // A logger must never fail a step.
        }
      };
      safeLog({ ...base, phase: "start", ...(manifest.sensitive ? {} : { input }) });

      const finish = (result: Result<z.output<Out>>): Result<z.output<Out>> => {
        const ms = Math.round(performance.now() - started);
        try {
          run.ports.metrics.timing(
            "step.duration_ms",
            ms,
            result.ok ? { step: def.name, outcome: "ok" } : { step: def.name, outcome: "error", kind: result.error.kind },
          );
        } catch {
          // Telemetry never fails a step.
        }
        if (result.ok) {
          safeLog({ ...base, phase: "end", ok: true, ms, ...(manifest.sensitive ? {} : { output: result.value }) });
        } else {
          const e = result.error;
          safeLog({
            ...base,
            phase: "end",
            ok: false,
            ms,
            error: { kind: e.kind, audience: e.audience, ...(manifest.sensitive ? {} : { message: e.message }) },
          });
          if (!declared.has(e.kind)) {
            safeLog({ ...base, phase: "debug", message: `step returned error kind "${e.kind}" that its manifest does not declare` });
          }
        }
        return result;
      };

      const parsedIn = def.input.safeParse(input);
      if (!parsedIn.success) {
        return finish(
          err(makeError("validation", def.name, run.stripId, `input rejected: ${summarize(parsedIn.error)}`, { cause: parsedIn.error })),
        );
      }

      let produced: unknown;
      try {
        const ctx = buildContext(manifest, run, safeLog, base);
        produced = await def.run(parsedIn.data, ctx as StepCtx<U, P>);
      } catch (thrown) {
        return finish(err(fromThrown(thrown, def.name, run.stripId)));
      }

      let value: unknown = produced;
      if (isResult(produced)) {
        if (!produced.ok) return finish(err(claim(produced.error, def.name, run.stripId)));
        value = produced.value;
      }

      const parsedOut = def.output.safeParse(value);
      if (!parsedOut.success) {
        return finish(
          err(makeError("validation", def.name, run.stripId, `output rejected: ${summarize(parsedOut.error)}`, { cause: parsedOut.error })),
        );
      }
      return finish(ok(parsedOut.data as z.output<Out>));
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers

function summarize(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.length > 0 ? i.path.join(".") : "(root)"}: ${i.message}`).join("; ");
}

function isResult(v: unknown): v is Result<unknown> {
  if (typeof v !== "object" || v === null) return false;
  const r = v as { ok?: unknown; value?: unknown; error?: unknown };
  if (r.ok === true) return "value" in r;
  if (r.ok === false) return typeof r.error === "object" && r.error !== null;
  return false;
}

/** An error built by an adapter does not know its step. Give it the real step and strip, keeping `cause`. */
function claim(error: StepError, step: string, stripId: string): StepError {
  if (!isPortError(error)) return error;
  const copy = { ...error, step, stripId } as StepError;
  if (error.cause !== undefined) {
    Object.defineProperty(copy, "cause", { value: error.cause, enumerable: false, writable: true, configurable: true });
  }
  return copy;
}

function forbidden(step: string, stripId: string, what: string): Result<never> {
  return err(makeError("forbidden", step, stripId, `step ${step} is not allowed to ${what}`));
}

type LogFn = (entry: Parameters<Logger["log"]>[0]) => void;

function buildContext(
  manifest: StepManifest,
  run: RunContext,
  log: LogFn,
  base: { stripId: string; step: string; class: StepClass },
): Record<string, unknown> {
  const { name: step } = manifest;
  const { stripId, ports } = run;
  const perms = manifest.permissions;
  const ctx: Record<string, unknown> = {
    stripId,
    log: { debug: (message: string) => log({ ...base, phase: "debug", message }) } satisfies StepLog,
  };
  const uses = new Set(manifest.uses);
  const claimed = <T>(p: Promise<Result<T>>): Promise<Result<T>> =>
    p.then((r) => (r.ok ? r : err(claim(r.error, step, stripId))));

  if (uses.has("database")) {
    const readable = new Set([...perms.reads, ...perms.writes].filter((s) => !s.startsWith("cache:")));
    const writable = new Set(perms.writes.filter((s) => !s.startsWith("cache:")));
    const deniedReader = (collection: string): DbReader => ({
      get: async () => forbidden(step, stripId, `read collection "${collection}"`),
      findBy: async () => forbidden(step, stripId, `read collection "${collection}"`),
      list: async () => forbidden(step, stripId, `read collection "${collection}"`),
    });
    const deniedWriter = (collection: string): DbWriter => ({
      create: async () => forbidden(step, stripId, `write collection "${collection}"`),
      update: async () => forbidden(step, stripId, `write collection "${collection}"`),
      delete: async () => forbidden(step, stripId, `write collection "${collection}"`),
    });
    const database: Record<string, unknown> = {
      read(collection: string): DbReader {
        if (!readable.has(collection)) return deniedReader(collection);
        const r = ports.database.read(collection);
        return {
          get: (id: string) => claimed(r.get(id)),
          findBy: (field: string, value: Scalar) => claimed(r.findBy(field, value)),
          list: (options) => claimed(r.list(options)),
        };
      },
    };
    if (writable.size > 0) {
      database.write = (collection: string): DbWriter => {
        if (!writable.has(collection)) return deniedWriter(collection);
        const w = ports.database.write(collection);
        return {
          create: (record) => claimed(w.create(record)),
          update: (id, patch) => claimed(w.update(id, patch)),
          delete: (id) => claimed(w.delete(id)),
        };
      };
      database.batch = (ops: BatchOp[]): Promise<Result<void>> => {
        const outside = ops.find((op) => !writable.has(op.collection));
        if (outside) return Promise.resolve(forbidden(step, stripId, `write collection "${outside.collection}"`));
        return claimed(ports.database.batch(ops));
      };
    }
    ctx.database = database;
  }

  if (uses.has("cache")) {
    const ns = (list: readonly string[]): string[] =>
      list.filter((s) => s.startsWith("cache:")).map((s) => `${s.slice("cache:".length)}:`);
    const readNs = [...ns(perms.reads), ...ns(perms.writes)];
    const writeNs = ns(perms.writes);
    const allowed = (list: string[], key: string): boolean => list.some((p) => key.startsWith(p));
    const cache: Record<string, unknown> = {};
    if (readNs.length > 0) {
      cache.get = <T>(key: string, schema: ZodType<T>) =>
        allowed(readNs, key) ? claimed(ports.cache.get(key, schema)) : Promise.resolve(forbidden(step, stripId, `read cache key "${key}"`));
    }
    if (writeNs.length > 0) {
      cache.set = <T>(key: string, value: T, options: { ttlMs: number }) =>
        allowed(writeNs, key) ? claimed(ports.cache.set(key, value, options)) : Promise.resolve(forbidden(step, stripId, `write cache key "${key}"`));
      cache.delete = (key: string) =>
        allowed(writeNs, key) ? claimed(ports.cache.delete(key)) : Promise.resolve(forbidden(step, stripId, `write cache key "${key}"`));
      cache.deleteByPrefix = (prefix: string) =>
        allowed(writeNs, prefix) ? claimed(ports.cache.deleteByPrefix(prefix)) : Promise.resolve(forbidden(step, stripId, `write cache prefix "${prefix}"`));
    }
    ctx.cache = cache;
  }

  if (uses.has("storage")) {
    const prefixes = [...perms.storage];
    const storage: Record<string, unknown> = {};
    if (prefixes.length > 0) {
      const allowed = (key: string): boolean => prefixes.some((p) => key.startsWith(p));
      const deny = (key: string): Promise<Result<never>> => Promise.resolve(forbidden(step, stripId, `use storage key "${key}"`));
      storage.get = (key: string) => (allowed(key) ? claimed(ports.storage.get(key)) : deny(key));
      storage.put = (key: string, bytes: Uint8Array, options: { contentType: string }) =>
        allowed(key) ? claimed(ports.storage.put(key, bytes, options)) : deny(key);
      storage.delete = (key: string) => (allowed(key) ? claimed(ports.storage.delete(key)) : deny(key));
      storage.list = (prefix: string, options?: { cursor?: string; limit?: number }) =>
        allowed(prefix) ? claimed(ports.storage.list(prefix, options)) : deny(prefix);
    }
    ctx.storage = storage;
  }

  if (uses.has("clock")) ctx.clock = ports.clock;
  if (uses.has("ids")) ctx.ids = ports.ids;
  return ctx;
}
