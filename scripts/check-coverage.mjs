#!/usr/bin/env node
// Checks an app coverage file (see docs/app-coverage.template.md).
// Usage: node scripts/check-coverage.mjs <coverage-file> [--strict] [--items=47]
//
// Errors (exit 1): missing or duplicate item rows, empty or invalid status,
//   missing reference/reason, `planned` reference path that does not exist.
// Gaps: `unplanned` items. Listed always. They fail the run only with --strict.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const strict = args.includes("--strict");
const itemsArg = args.find((a) => a.startsWith("--items="));
const expectedItems = itemsArg ? Number(itemsArg.split("=")[1]) : 63;

if (!file) {
  process.stderr.write("Usage: node scripts/check-coverage.mjs <coverage-file> [--strict] [--items=N]\n");
  process.exit(2);
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATUSES = new Set(["planned", "unplanned", "not-needed", "deferred"]);

const lines = readFileSync(resolve(file), "utf8").split("\n");
const rows = new Map();
const errors = [];
const gaps = [];

for (const line of lines) {
  if (!line.startsWith("|")) continue;
  const cells = line.split("|").slice(1, -1).map((c) => c.trim());
  if (cells.length < 4 || !/^\d+$/.test(cells[0])) continue;
  const [num, item, status, ref] = cells;
  const n = Number(num);
  if (rows.has(n)) {
    errors.push(`#${n} ${item}: duplicate row`);
    continue;
  }
  rows.set(n, { item, status, ref });
}

for (let n = 1; n <= expectedItems; n++) {
  const row = rows.get(n);
  if (!row) {
    errors.push(`#${n}: row missing`);
    continue;
  }
  const { item, status, ref } = row;
  const label = `#${n} ${item}`;
  if (status === "") {
    errors.push(`${label}: no status`);
  } else if (!STATUSES.has(status)) {
    errors.push(`${label}: invalid status "${status}" (use planned, unplanned, not-needed, deferred)`);
  } else if (status === "unplanned") {
    gaps.push(label);
  } else if (ref === "") {
    errors.push(`${label}: "${status}" needs a ${status === "planned" ? "reference path" : "reason"}`);
  } else if (status === "planned") {
    const target = resolve(repoRoot, ref.split("#")[0]);
    if (!existsSync(target)) errors.push(`${label}: referenced path not found: ${ref}`);
  }
}

for (const n of rows.keys()) {
  if (n < 1 || n > expectedItems) errors.push(`#${n}: outside expected range 1-${expectedItems}`);
}

const out = (s) => process.stdout.write(s + "\n");
if (gaps.length) {
  out(`Gaps (${gaps.length}):`);
  for (const g of gaps) out(`  - ${g}`);
}
if (errors.length) {
  out(`Errors (${errors.length}):`);
  for (const e of errors) out(`  - ${e}`);
}
if (!errors.length && !gaps.length) out(`OK: all ${expectedItems} items have a valid status.`);

process.exit(errors.length || (strict && gaps.length) ? 1 : 0);
