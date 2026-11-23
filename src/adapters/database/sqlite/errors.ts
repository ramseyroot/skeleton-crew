// Maps node:sqlite failures to ErrorKind. node:sqlite throws an Error with `code` "ERR_SQLITE_ERROR" and a numeric
// `errcode`, which is the SQLite extended result code. The low 8 bits are the primary code.
// Checked against real thrown errors: unique index 2067, primary key 1555, not null 1299, busy 5, locked 6,
// cannot open the file 14, SQL logic error 1.
//
// Choices:
// - Unique index or primary key violation, and any other constraint failure: conflict. The write clashes with stored data.
// - NOT NULL violation: validation. The adapter checks required fields first, so this only fires if a record
//   reaches the table without that check.
// - Busy or locked: network. Another connection holds the file. The failure is transient, so a retry can work.
// - Cannot open, I/O error, corruption and everything else: unexpected (the fallback).

import { createErrorMap } from "../../../lib/error-map.ts";
import type { ErrorRule } from "../../../lib/error-map.ts";

const PRIMARY_MASK = 0xff;
const SQLITE_CONSTRAINT = 19;
const SQLITE_CONSTRAINT_NOTNULL = 1299;
const SQLITE_BUSY = 5;
const SQLITE_LOCKED = 6;

function errcodeOf(thrown: unknown): number | null {
  if (typeof thrown !== "object" || thrown === null) return null;
  const e = thrown as { code?: unknown; errcode?: unknown };
  return e.code === "ERR_SQLITE_ERROR" && typeof e.errcode === "number" ? e.errcode : null;
}

const rules: ErrorRule[] = [
  {
    name: "sqlite not null constraint",
    when: (t) => errcodeOf(t) === SQLITE_CONSTRAINT_NOTNULL,
    kind: "validation",
  },
  {
    name: "sqlite unique, primary key or other constraint",
    when: (t) => {
      const code = errcodeOf(t);
      return code !== null && (code & PRIMARY_MASK) === SQLITE_CONSTRAINT;
    },
    kind: "conflict",
  },
  {
    name: "sqlite database busy",
    when: (t) => {
      const code = errcodeOf(t);
      return code !== null && (code & PRIMARY_MASK) === SQLITE_BUSY;
    },
    kind: "network",
  },
  {
    name: "sqlite table locked",
    when: (t) => {
      const code = errcodeOf(t);
      return code !== null && (code & PRIMARY_MASK) === SQLITE_LOCKED;
    },
    kind: "network",
  },
];

export const errorMap = createErrorMap(rules, "unexpected");
