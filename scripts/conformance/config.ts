// Loads and validates conformance.config.json.
// Unknown fields are errors, so a typo cannot silently disable a setting.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const CONFIG_FILE = "conformance.config.json";

export type Config = {
  sourceRoots: string[];
  folders: {
    features: string;
    shared: string;
    ports: string;
    adapters: string;
    loggerAdapter: string;
    config: string;
    coverage: string;
  };
  classes: string[];
  providerPackages: string[];
  nearDuplicateVerbs: string[];
  prodSecretNames: string[];
  destructiveScripts: { globs: string[]; guardCall: string };
  output: { maxChars: number; maxPerRule: number; reportDir: string };
  checks: { typecheck: string | null; test: string | null; testFiles: string | null };
  stopHook: { maxConsecutiveBlocks: number; skipIfUnchanged: boolean };
  steering: { alwaysMaxLines: number; otherMaxLines: number };
  worktrees: { folder: string; maxParallel: number };
  guardedFolders: string[];
  specsFolder: string;
  protected: string[];
};

export class ConfigError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(`${CONFIG_FILE}: ${field}: ${message}`);
    this.name = "ConfigError";
    this.field = field;
  }
}

type Shape =
  | "string"
  | "string[]"
  | "string|null"
  | "positiveInt"
  | "boolean"
  | { [key: string]: Shape };

const SHAPE: { [key: string]: Shape } = {
  sourceRoots: "string[]",
  folders: {
    features: "string",
    shared: "string",
    ports: "string",
    adapters: "string",
    loggerAdapter: "string",
    config: "string",
    coverage: "string",
  },
  classes: "string[]",
  providerPackages: "string[]",
  nearDuplicateVerbs: "string[]",
  prodSecretNames: "string[]",
  destructiveScripts: { globs: "string[]", guardCall: "string" },
  output: { maxChars: "positiveInt", maxPerRule: "positiveInt", reportDir: "string" },
  checks: { typecheck: "string|null", test: "string|null", testFiles: "string|null" },
  stopHook: { maxConsecutiveBlocks: "positiveInt", skipIfUnchanged: "boolean" },
  steering: { alwaysMaxLines: "positiveInt", otherMaxLines: "positiveInt" },
  worktrees: { folder: "string", maxParallel: "positiveInt" },
  guardedFolders: "string[]",
  specsFolder: "string",
  protected: "string[]",
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function check(value: unknown, shape: Shape, path: string): void {
  if (typeof shape === "object") {
    if (!isRecord(value)) throw new ConfigError(path, "must be an object");
    for (const key of Object.keys(shape)) {
      if (!(key in value)) throw new ConfigError(`${path}.${key}`, "is missing");
      check(value[key], shape[key] as Shape, `${path}.${key}`);
    }
    for (const key of Object.keys(value)) {
      if (!(key in shape)) throw new ConfigError(`${path}.${key}`, "is not a known field");
    }
    return;
  }
  switch (shape) {
    case "string":
      if (typeof value !== "string" || value === "") throw new ConfigError(path, "must be a non-empty string");
      return;
    case "string|null":
      if (value !== null && (typeof value !== "string" || value === "")) {
        throw new ConfigError(path, "must be a non-empty string or null");
      }
      return;
    case "string[]":
      if (!Array.isArray(value) || !value.every((v) => typeof v === "string" && v !== "")) {
        throw new ConfigError(path, "must be a list of non-empty strings");
      }
      return;
    case "positiveInt":
      if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
        throw new ConfigError(path, "must be a whole number of 1 or more");
      }
      return;
    case "boolean":
      if (typeof value !== "boolean") throw new ConfigError(path, "must be true or false");
      return;
  }
}

/** Validates a parsed config object. Throws ConfigError naming the first bad field. */
export function parseConfig(raw: unknown): Config {
  if (!isRecord(raw)) throw new ConfigError("(root)", "must be an object");
  for (const key of Object.keys(SHAPE)) {
    if (!(key in raw)) throw new ConfigError(key, "is missing");
    check(raw[key], SHAPE[key] as Shape, key);
  }
  for (const key of Object.keys(raw)) {
    if (!(key in SHAPE)) throw new ConfigError(key, "is not a known field");
  }
  return raw as Config;
}

/** Reads and validates the config file in `root`. */
export function loadConfig(root: string): Config {
  const file = join(root, CONFIG_FILE);
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new ConfigError("(file)", `not found at ${file}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new ConfigError("(file)", `is not valid JSON (${e instanceof Error ? e.message : "parse error"})`);
  }
  return parseConfig(raw);
}
