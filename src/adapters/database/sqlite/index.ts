import { DatabaseSync } from "node:sqlite";
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

// SQLite Database adapter on node:sqlite (built into Node 24). One table per collection: id TEXT PRIMARY KEY,
// createdAt, updatedAt, and one typed column per declared field (booleans are stored as 0/1). Unique fields get
// UNIQUE indexes on the normalized stored value, indexed fields get plain indexes. Table and column names are
// checked against NAME_RE and always double-quoted. Values only travel as bound parameters.
// Collection definitions are kept in the _collections table, so a file database remembers them across opens.
// The validation helpers before createSqliteDatabase are repeated in the memory adapter on purpose: each adapter
// folder stands alone, and the contract suite catches any drift between the two.

const ADAPTER = "database/sqlite";
const NAME_RE = /^[a-z][A-Za-z0-9_]*$/;
const RESERVED = new Set(["id", "createdat", "updatedat"]);
const RESERVED_EXACT = new Set(["id", "createdAt", "updatedAt"]);
const FIELD_TYPES = new Set(["string", "number", "boolean"]);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

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

function describeOp(op: BatchOp): string {
  if (typeof op !== "object" || op === null) return String(op);
  const o = op as { op?: unknown; collection?: unknown; id?: unknown; record?: { id?: unknown } | null };
  const id = o.op === "create" ? o.record?.id : o.id;
  return `${String(o.op)} ${String(o.collection)} ${String(id)}`;
}

type Param = string | number | null;
type Row = Record<string, unknown>;

export type SqliteDatabase = Database & {
  /** Closes the file. Later calls open it again. */
  close(): Result<void>;
};

function q(name: string): string {
  if (!NAME_RE.test(name)) throw new Error(`refusing to quote unsafe identifier ${JSON.stringify(name)}`);
  return `"${name}"`;
}

const COLUMN_TYPE = { string: "TEXT", number: "REAL", boolean: "INTEGER" } as const;

function toParam(v: Scalar): Param {
  return typeof v === "boolean" ? (v ? 1 : 0) : v;
}

function fromRow(def: CollectionDef, row: Row): DbRecord {
  const rec: DbRecord = { id: row.id as string, createdAt: row.createdAt as string, updatedAt: row.updatedAt as string };
  for (const [fname, f] of Object.entries(def.fields)) {
    const raw = row[fname];
    rec[fname] = raw === null || raw === undefined ? null : f.type === "boolean" ? raw !== 0 : (raw as string | number);
  }
  return rec;
}

export function createSqliteDatabase(deps: { clock: Clock; path: string }): SqliteDatabase {
  const { clock, path } = deps;
  let handle: DatabaseSync | null = null;
  const defs = new Map<string, CollectionDef>();

  /** Opens on first use, so a bad path comes back as a Result error from the first call, and health(). */
  function conn(): DatabaseSync {
    if (handle) return handle;
    const h = new DatabaseSync(path, { timeout: 2000 });
    try {
      h.exec('CREATE TABLE IF NOT EXISTS "_collections" (name TEXT PRIMARY KEY, def TEXT NOT NULL)');
    } catch (thrown) {
      h.close();
      throw thrown;
    }
    handle = h;
    return h;
  }

  function reloadDefs(): void {
    const rows = conn().prepare('SELECT name, def FROM "_collections"').all() as Row[];
    defs.clear();
    for (const row of rows) defs.set(row.name as string, JSON.parse(row.def as string) as CollectionDef);
  }

  function resolve(collection: string): Result<CollectionDef> {
    let def = defs.get(collection);
    if (def === undefined) {
      reloadDefs(); // another connection may have migrated it
      def = defs.get(collection);
    }
    return def === undefined ? fail("validation", `collection not migrated: ${JSON.stringify(collection)}`) : ok(def);
  }

  /** Runs fn between BEGIN and COMMIT. A failed Result or a throw rolls everything back. */
  function inTransaction<T>(fn: () => Result<T>): Result<T> {
    const db = conn();
    db.exec("BEGIN IMMEDIATE");
    let result: Result<T>;
    try {
      result = fn();
    } catch (thrown) {
      rollback(db);
      throw thrown;
    }
    if (!result.ok) {
      rollback(db);
      return result;
    }
    try {
      db.exec("COMMIT");
    } catch (thrown) {
      rollback(db);
      throw thrown;
    }
    return result;
  }

  function rollback(db: DatabaseSync): void {
    if (!db.isTransaction) return;
    try {
      db.exec("ROLLBACK");
    } catch {
      // The caller rethrows or returns the first failure, which is the one worth reporting.
    }
  }

  function selectById(def: CollectionDef, id: string): DbRecord | null {
    const row = conn().prepare(`SELECT * FROM ${q(def.name)} WHERE "id" = ?`).get(id) as Row | undefined;
    return row === undefined ? null : fromRow(def, row);
  }

  function create(collection: string, record: unknown): Result<DbRecord> {
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
    const names = Object.keys(def.fields);
    const params: Param[] = [];
    for (const fname of names) {
      const f = def.fields[fname] as FieldDef;
      const raw = input[fname] === undefined ? null : input[fname];
      const problem = checkScalar(fname, f, raw);
      if (problem !== null) return fail("validation", `${problem} in ${collection}`);
      params.push(toParam(normalized(f, raw as Scalar)));
    }
    const now = clock.now();
    const columns = ["id", "createdAt", "updatedAt", ...names].map(q).join(", ");
    const marks = ["?", "?", "?", ...names.map(() => "?")].join(", ");
    // A duplicate id or unique value makes SQLite throw a constraint error, which the error map turns into conflict.
    conn().prepare(`INSERT INTO ${q(collection)} (${columns}) VALUES (${marks})`).run(input.id, now, now, ...params);
    const stored = selectById(def, input.id);
    return stored === null ? fail("unexpected", `${collection} ${input.id} missing after insert`) : ok(stored);
  }

  function update(collection: string, id: string, patch: unknown): Result<DbRecord> {
    const d = resolve(collection);
    if (!d.ok) return d;
    const def = d.value;
    if (typeof patch !== "object" || patch === null) return fail("validation", "patch must be an object");
    const sets: string[] = [`${q("updatedAt")} = ?`];
    const params: Param[] = [clock.now()];
    for (const [key, raw] of Object.entries(patch as Record<string, unknown>)) {
      if (RESERVED_EXACT.has(key)) return fail("validation", `field "${key}" is reserved and cannot be patched`);
      const f = def.fields[key];
      if (f === undefined) return fail("validation", `unknown field "${key}" in ${collection}`);
      const problem = checkScalar(key, f, raw);
      if (problem !== null) return fail("validation", `${problem} in ${collection}`);
      sets.push(`${q(key)} = ?`);
      params.push(toParam(normalized(f, raw as Scalar)));
    }
    const changed = conn().prepare(`UPDATE ${q(collection)} SET ${sets.join(", ")} WHERE "id" = ?`).run(...params, id);
    if (Number(changed.changes) === 0) return fail("not_found", `${collection} has no record ${id}`);
    const stored = selectById(def, id);
    return stored === null ? fail("unexpected", `${collection} ${id} missing after update`) : ok(stored);
  }

  function remove(collection: string, id: string): Result<void> {
    const d = resolve(collection);
    if (!d.ok) return d;
    const changed = conn().prepare(`DELETE FROM ${q(collection)} WHERE "id" = ?`).run(id);
    return Number(changed.changes) === 0 ? fail("not_found", `${collection} has no record ${id}`) : ok(undefined);
  }

  function reader(collection: string): DbReader {
    return {
      async get(id) {
        return guard(() => {
          const d = resolve(collection);
          return d.ok ? ok(selectById(d.value, id)) : d;
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
          const wanted = toParam(normalized(f, value));
          const rows =
            wanted === null
              ? conn().prepare(`SELECT * FROM ${q(collection)} WHERE ${q(field)} IS NULL ORDER BY "id"`).all()
              : conn().prepare(`SELECT * FROM ${q(collection)} WHERE ${q(field)} = ? ORDER BY "id"`).all(wanted);
          return ok((rows as Row[]).map((row) => fromRow(d.value, row)));
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
          const rows = (
            after === null
              ? conn().prepare(`SELECT * FROM ${q(collection)} ORDER BY "id" LIMIT ?`).all(limit + 1)
              : conn().prepare(`SELECT * FROM ${q(collection)} WHERE "id" > ? ORDER BY "id" LIMIT ?`).all(after, limit + 1)
          ) as Row[];
          const items = rows.slice(0, limit).map((row) => fromRow(d.value, row));
          const last = items[items.length - 1];
          const page: Page = { items, nextCursor: rows.length > limit && last ? cursorOf(last.id) : null };
          return ok(page);
        });
      },
    };
  }

  function writer(collection: string): DbWriter {
    return {
      async create(record: NewRecord) {
        return guard(() => create(collection, record));
      },
      async update(id, patch) {
        return guard(() => update(collection, id, patch));
      },
      async delete(id) {
        return guard(() => remove(collection, id));
      },
    };
  }

  function createIndexes(def: CollectionDef, fieldNames: string[]): void {
    for (const fname of fieldNames) {
      const f = def.fields[fname] as FieldDef;
      if (f.unique !== true && f.indexed !== true) continue;
      const index = q(`ix_${def.name.length}_${def.name}_${fname}`);
      const kind = f.unique === true ? "UNIQUE INDEX" : "INDEX";
      conn().exec(`CREATE ${kind} IF NOT EXISTS ${index} ON ${q(def.name)} (${q(fname)})`);
    }
  }

  function applyMigration(plan: CollectionDef[]): void {
    const db = conn();
    for (const def of plan) {
      const old = defs.get(def.name);
      const names = Object.keys(def.fields);
      if (old === undefined) {
        const columns = [
          '"id" TEXT PRIMARY KEY',
          '"createdAt" TEXT NOT NULL',
          '"updatedAt" TEXT NOT NULL',
          ...names.map((n) => {
            const f = def.fields[n] as FieldDef;
            return `${q(n)} ${COLUMN_TYPE[f.type]}${f.optional === true ? "" : " NOT NULL"}`;
          }),
        ];
        db.exec(`CREATE TABLE ${q(def.name)} (${columns.join(", ")})`);
        createIndexes(def, names);
      } else {
        const added = names.filter((n) => old.fields[n] === undefined);
        for (const n of added) {
          db.exec(`ALTER TABLE ${q(def.name)} ADD COLUMN ${q(n)} ${COLUMN_TYPE[(def.fields[n] as FieldDef).type]}`);
        }
        createIndexes(def, added);
        if (added.length === 0) continue; // unchanged: nothing to store
      }
      db.prepare(
        'INSERT INTO "_collections" (name, def) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET def = excluded.def',
      ).run(def.name, JSON.stringify(def));
    }
  }

  return {
    name: "sqlite",
    read: reader,
    write: writer,
    async batch(ops) {
      return guard(() => {
        if (!Array.isArray(ops)) return fail("validation", "batch needs an array of operations");
        if (ops.length === 0) return ok(undefined);
        return inTransaction(() => {
          for (const [i, op] of ops.entries()) {
            const o = op as Partial<Record<string, unknown>> | null;
            const r = guard<unknown>(() => {
              if (o === null || typeof o !== "object") return fail("validation", "operation must be an object");
              if (typeof o.collection !== "string") return fail("validation", "operation needs a collection name");
              if (o.op === "create") return create(o.collection, o.record);
              if (o.op === "update") return update(o.collection, o.id as string, o.patch);
              if (o.op === "delete") return remove(o.collection, o.id as string);
              return fail("validation", `unknown operation ${JSON.stringify(o.op)}`);
            });
            if (!r.ok) {
              const message = `op ${i} (${describeOp(op)}): ${r.error.kind} - ${r.error.message}`;
              return err(portError(r.error.kind, ADAPTER, message, { retryable: r.error.retryable, cause: r.error.cause }));
            }
          }
          return ok(undefined);
        });
      });
    },
    async health() {
      return guard(() => {
        conn().prepare("SELECT 1 AS one").get();
        return ok({ healthy: true as const });
      });
    },
    async migrate(collections) {
      return guard(() => {
        conn();
        reloadDefs();
        const plan = planMigration(collections, defs);
        if (!plan.ok) return plan;
        const applied = inTransaction(() => {
          applyMigration(plan.value);
          return ok(undefined);
        });
        if (applied.ok) reloadDefs();
        return applied;
      });
    },
    close() {
      return guard(() => {
        handle?.close();
        handle = null;
        defs.clear();
        return ok(undefined);
      });
    },
  };
}
