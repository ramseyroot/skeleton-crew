import type { Clock } from "../../../ports/clock.ts";
import type {
  BatchOp,
  CollectionDef,
  Database,
  DbReader,
  DbRecord,
  DbWriter,
  FieldDef,
  NewRecord,
  Page,
  Scalar,
} from "../../../ports/database.ts";
import { portError } from "../../../lib/port-error.ts";
import { err, ok } from "../../../lib/result.ts";
import type { ErrorKind, Result } from "../../../lib/result.ts";
import { errorMap } from "./errors.ts";

// In-memory Database adapter. Plain Maps, no provider. It follows the semantics written in ports/database.ts.
// The validation helpers below are repeated in the sqlite adapter on purpose: each adapter folder stands alone,
// and the contract suite catches any drift between the two.

const ADAPTER = "database/memory";
const NAME_RE = /^[a-z][A-Za-z0-9_]*$/;
const RESERVED = new Set(["id", "createdat", "updatedat"]);
const RESERVED_EXACT = new Set(["id", "createdAt", "updatedAt"]);
const FIELD_TYPES = new Set(["string", "number", "boolean"]);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

type Table = Map<string, DbRecord>;
type Tables = Map<string, Table>;

function fail(kind: ErrorKind, message: string): Result<never> {
  return err(portError(kind, ADAPTER, message, { retryable: false }));
}

function thrownToResult(thrown: unknown): Result<never> {
  const kind = errorMap.map(thrown);
  const message = thrown instanceof Error ? thrown.message : "unexpected failure";
  return err(portError(kind, ADAPTER, message, { cause: thrown }));
}

/** Runs `fn` and turns anything it throws into a Result error through the error map. */
function guard<T>(fn: () => Result<T>): Result<T> {
  try {
    return fn();
  } catch (thrown) {
    return thrownToResult(thrown);
  }
}

function fieldKey(f: FieldDef): string {
  return JSON.stringify([f.type, f.optional === true, f.unique === true, f.indexed === true, f.normalize ?? null]);
}

function cleanField(f: FieldDef): FieldDef {
  const out: FieldDef = { type: f.type };
  if (f.optional === true) out.optional = true;
  if (f.unique === true) out.unique = true;
  if (f.indexed === true) out.indexed = true;
  if (f.normalize === "lower") out.normalize = "lower";
  return out;
}

/** Validates the defs and merges them with what exists. Returns the full definition of every collection named. */
function planMigration(defs: unknown, existing: ReadonlyMap<string, CollectionDef>): Result<CollectionDef[]> {
  if (!Array.isArray(defs)) return fail("validation", "migrate needs an array of collection definitions");
  const known = new Map<string, string>();
  for (const name of existing.keys()) known.set(name.toLowerCase(), name);
  const inCall = new Set<string>();
  const out: CollectionDef[] = [];
  for (const raw of defs as unknown[]) {
    if (typeof raw !== "object" || raw === null) return fail("validation", "a collection definition must be an object");
    const d = raw as { name?: unknown; fields?: unknown };
    if (typeof d.name !== "string" || !NAME_RE.test(d.name)) {
      return fail("validation", `invalid collection name ${JSON.stringify(d.name)}: use ${NAME_RE.source}`);
    }
    const prior = known.get(d.name.toLowerCase());
    if (prior !== undefined && prior !== d.name) {
      return fail("validation", `collection "${d.name}" clashes with "${prior}" (names are unique ignoring case)`);
    }
    if (inCall.has(d.name)) return fail("validation", `collection "${d.name}" is defined twice`);
    inCall.add(d.name);
    known.set(d.name.toLowerCase(), d.name);
    if (typeof d.fields !== "object" || d.fields === null) {
      return fail("validation", `collection "${d.name}" needs a fields object`);
    }
    const merged: Record<string, FieldDef> = {};
    const old = existing.get(d.name);
    for (const [fname, f] of Object.entries(d.fields as Record<string, FieldDef>)) {
      const where = `${d.name}.${fname}`;
      if (!NAME_RE.test(fname)) return fail("validation", `invalid field name "${where}": use ${NAME_RE.source}`);
      if (RESERVED.has(fname.toLowerCase())) return fail("validation", `field name "${where}" is reserved`);
      if (typeof f !== "object" || f === null || !FIELD_TYPES.has(f.type)) {
        return fail("validation", `field "${where}" needs a type of string, number or boolean`);
      }
      if (f.normalize !== undefined && (f.normalize !== "lower" || f.type !== "string")) {
        return fail("validation", `field "${where}": normalize "lower" applies to string fields only`);
      }
      const clean = cleanField(f);
      const before = old?.fields[fname];
      if (before !== undefined && fieldKey(before) !== fieldKey(clean)) {
        return fail("validation", `field "${where}" already exists with a different definition`);
      }
      if (old !== undefined && before === undefined && clean.optional !== true) {
        return fail("validation", `field "${where}" is added to an existing collection, so it must be optional`);
      }
      merged[fname] = clean;
    }
    if (old !== undefined) {
      for (const [fname, f] of Object.entries(old.fields)) if (merged[fname] === undefined) merged[fname] = f;
    }
    const lowers = new Set<string>();
    for (const fname of Object.keys(merged)) {
      const low = fname.toLowerCase();
      if (lowers.has(low)) return fail("validation", `collection "${d.name}" has fields that differ only by case: "${fname}"`);
      lowers.add(low);
    }
    out.push({ name: d.name, fields: merged });
  }
  return ok(out);
}

function checkScalar(fname: string, f: FieldDef, v: unknown): string | null {
  if (v === null) return f.optional === true ? null : `field "${fname}" is required`;
  if (typeof v !== f.type) return `field "${fname}" must be a ${f.type}`;
  if (f.type === "number" && !Number.isFinite(v)) return `field "${fname}" must be a finite number`;
  return null;
}

function normalized(f: FieldDef, v: Scalar): Scalar {
  return f.normalize === "lower" && typeof v === "string" ? v.toLowerCase() : v;
}

function cursorOf(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

function idOfCursor(cursor: unknown): string | null {
  if (typeof cursor !== "string" || cursor === "") return null;
  const id = Buffer.from(cursor, "base64url").toString("utf8");
  return id !== "" && cursorOf(id) === cursor ? id : null;
}

/** Same order as SQLite's default text comparison: UTF-8 bytes. */
function byId(a: DbRecord, b: DbRecord): number {
  return Buffer.compare(Buffer.from(a.id, "utf8"), Buffer.from(b.id, "utf8"));
}

function describeOp(op: BatchOp): string {
  if (typeof op !== "object" || op === null) return String(op);
  const o = op as { op?: unknown; collection?: unknown; id?: unknown; record?: { id?: unknown } | null };
  const id = o.op === "create" ? o.record?.id : o.id;
  return `${String(o.op)} ${String(o.collection)} ${String(id)}`;
}

export function createMemoryDatabase(deps: { clock: Clock }): Database {
  const { clock } = deps;
  const defs = new Map<string, CollectionDef>();
  const tables: Tables = new Map();

  function resolve(collection: string): Result<CollectionDef> {
    const def = defs.get(collection);
    return def === undefined ? fail("validation", `collection not migrated: ${JSON.stringify(collection)}`) : ok(def);
  }

  /** A view over the tables. In a batch it copies a table the first time the batch touches it. */
  function openStore(copyOnTouch: boolean) {
    const touched: Tables = new Map();
    return {
      table(name: string): Table {
        const mine = touched.get(name);
        if (mine) return mine;
        let base = tables.get(name);
        if (!base) {
          base = new Map();
          tables.set(name, base);
        }
        if (!copyOnTouch) return base;
        const copy: Table = new Map();
        for (const [id, rec] of base) copy.set(id, { ...rec });
        touched.set(name, copy);
        return copy;
      },
      commit(): void {
        for (const [name, table] of touched) tables.set(name, table);
      },
    };
  }
  type Store = ReturnType<typeof openStore>;

  function uniqueClash(def: CollectionDef, table: Table, values: Record<string, Scalar>, selfId: string): string | null {
    for (const [fname, f] of Object.entries(def.fields)) {
      const v = values[fname];
      if (f.unique !== true || v === undefined || v === null) continue;
      for (const rec of table.values()) {
        if (rec.id !== selfId && rec[fname] === v) return `unique field "${fname}" already has this value`;
      }
    }
    return null;
  }

  function create(store: Store, collection: string, record: unknown): Result<DbRecord> {
    const d = resolve(collection);
    if (!d.ok) return d;
    const def = d.value;
    if (typeof record !== "object" || record === null) return fail("validation", "record must be an object");
    const input = record as Record<string, unknown>;
    if (typeof input.id !== "string" || input.id === "") return fail("validation", "record needs a non-empty text id");
    for (const key of Object.keys(input)) {
      if (key === "id") continue;
      if (RESERVED_EXACT.has(key)) return fail("validation", `field "${key}" is reserved`);
      if (def.fields[key] === undefined) return fail("validation", `unknown field "${key}" in ${collection}`);
    }
    const values: Record<string, Scalar> = {};
    for (const [fname, f] of Object.entries(def.fields)) {
      const raw = input[fname] === undefined ? null : input[fname];
      const problem = checkScalar(fname, f, raw);
      if (problem !== null) return fail("validation", `${problem} in ${collection}`);
      values[fname] = normalized(f, raw as Scalar);
    }
    const table = store.table(collection);
    if (table.has(input.id)) return fail("conflict", `${collection} already has id ${input.id}`);
    const clash = uniqueClash(def, table, values, input.id);
    if (clash !== null) return fail("conflict", `${collection}: ${clash}`);
    const now = clock.now();
    const stored: DbRecord = { id: input.id, createdAt: now, updatedAt: now, ...values };
    table.set(stored.id, stored);
    return ok({ ...stored });
  }

  function update(store: Store, collection: string, id: string, patch: unknown): Result<DbRecord> {
    const d = resolve(collection);
    if (!d.ok) return d;
    const def = d.value;
    if (typeof patch !== "object" || patch === null) return fail("validation", "patch must be an object");
    const values: Record<string, Scalar> = {};
    for (const [key, raw] of Object.entries(patch as Record<string, unknown>)) {
      if (RESERVED_EXACT.has(key)) return fail("validation", `field "${key}" is reserved and cannot be patched`);
      const f = def.fields[key];
      if (f === undefined) return fail("validation", `unknown field "${key}" in ${collection}`);
      const problem = checkScalar(key, f, raw);
      if (problem !== null) return fail("validation", `${problem} in ${collection}`);
      values[key] = normalized(f, raw as Scalar);
    }
    const table = store.table(collection);
    const current = table.get(id);
    if (current === undefined) return fail("not_found", `${collection} has no record ${id}`);
    const clash = uniqueClash(def, table, values, id);
    if (clash !== null) return fail("conflict", `${collection}: ${clash}`);
    const next: DbRecord = { ...current, ...values, updatedAt: clock.now() };
    table.set(id, next);
    return ok({ ...next });
  }

  function remove(store: Store, collection: string, id: string): Result<void> {
    const d = resolve(collection);
    if (!d.ok) return d;
    const table = store.table(collection);
    if (!table.delete(id)) return fail("not_found", `${collection} has no record ${id}`);
    return ok(undefined);
  }

  function reader(collection: string): DbReader {
    return {
      async get(id) {
        return guard(() => {
          const d = resolve(collection);
          if (!d.ok) return d;
          const rec = tables.get(collection)?.get(id);
          return ok(rec === undefined ? null : { ...rec });
        });
      },
      async findBy(field, value) {
        return guard(() => {
          const d = resolve(collection);
          if (!d.ok) return d;
          const f = d.value.fields[field];
          if (f === undefined) return fail("validation", `unknown field "${field}" in ${collection}`);
          if (f.unique !== true && f.indexed !== true) {
            return fail("validation", `field "${field}" is not indexed, so findBy cannot use it`);
          }
          const problem = checkScalar(field, { ...f, optional: true }, value);
          if (problem !== null) return fail("validation", `${problem} in findBy`);
          const wanted = normalized(f, value);
          const found: DbRecord[] = [];
          for (const rec of tables.get(collection)?.values() ?? []) if (rec[field] === wanted) found.push({ ...rec });
          return ok(found.sort(byId));
        });
      },
      async list(options) {
        return guard(() => {
          const d = resolve(collection);
          if (!d.ok) return d;
          const limit = options?.limit ?? DEFAULT_LIMIT;
          if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
            return fail("validation", `limit must be a whole number from 1 to ${MAX_LIMIT}`);
          }
          let after: string | null = null;
          if (options?.cursor !== undefined) {
            after = idOfCursor(options.cursor);
            if (after === null) return fail("validation", "bad cursor");
          }
          const afterBytes = after === null ? null : Buffer.from(after, "utf8");
          const all = [...(tables.get(collection)?.values() ?? [])].sort(byId);
          const rest = afterBytes === null ? all : all.filter((r) => Buffer.compare(Buffer.from(r.id, "utf8"), afterBytes) > 0);
          const items = rest.slice(0, limit).map((r) => ({ ...r }));
          const last = items[items.length - 1];
          const page: Page = { items, nextCursor: rest.length > limit && last ? cursorOf(last.id) : null };
          return ok(page);
        });
      },
    };
  }

  function writer(collection: string): DbWriter {
    return {
      async create(record: NewRecord) {
        return guard(() => create(openStore(false), collection, record));
      },
      async update(id, patch) {
        return guard(() => update(openStore(false), collection, id, patch));
      },
      async delete(id) {
        return guard(() => remove(openStore(false), collection, id));
      },
    };
  }

  return {
    name: "memory",
    read: reader,
    write: writer,
    async batch(ops) {
      return guard(() => {
        if (!Array.isArray(ops)) return fail("validation", "batch needs an array of operations");
        const store = openStore(true);
        for (const [i, op] of ops.entries()) {
          const o = op as Partial<Record<string, unknown>> | null;
          let r: Result<unknown>;
          if (o === null || typeof o !== "object") r = fail("validation", "operation must be an object");
          else if (typeof o.collection !== "string") r = fail("validation", "operation needs a collection name");
          else if (o.op === "create") r = create(store, o.collection, o.record);
          else if (o.op === "update") r = update(store, o.collection, o.id as string, o.patch);
          else if (o.op === "delete") r = remove(store, o.collection, o.id as string);
          else r = fail("validation", `unknown operation ${JSON.stringify(o.op)}`);
          if (!r.ok) {
            const message = `op ${i} (${describeOp(op)}): ${r.error.kind} - ${r.error.message}`;
            return err(portError(r.error.kind, ADAPTER, message, { retryable: r.error.retryable, cause: r.error.cause }));
          }
        }
        store.commit();
        return ok(undefined);
      });
    },
    async health() {
      return ok({ healthy: true as const });
    },
    async migrate(collections) {
      return guard(() => {
        const plan = planMigration(collections, defs);
        if (!plan.ok) return plan;
        for (const def of plan.value) {
          defs.set(def.name, def);
          const table = tables.get(def.name) ?? new Map<string, DbRecord>();
          tables.set(def.name, table);
          // records written before a field was added read back as null for it
          for (const rec of table.values()) for (const fname of Object.keys(def.fields)) rec[fname] ??= null;
        }
        return ok(undefined);
      });
    },
  };
}
