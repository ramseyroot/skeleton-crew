// The one place that knows where steps and strips live (feature layout design, section 3).
//
//   src/features/<feature>/steps/<class>/<domain>.<verb>.ts     steps of one feature
//   src/features/<feature>/strips/<name>.strip.ts               strips of one feature
//   src/shared/steps/<class>/<domain>.<verb>.ts                 steps used by more than one feature
//
// Rules ask this module instead of hard-coding folder names.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "./config.ts";
import { isDir, isInside } from "./project.ts";

type Folders = Pick<Config["folders"], "features" | "shared">;

/** The feature a file belongs to, `"shared"` for src/shared, or null. */
export function featureOf(file: string, folders: Folders): string | null {
  if (isInside(file, folders.shared)) return "shared";
  if (isInside(file, folders.features)) {
    const rest = file.slice(folders.features.length + 1);
    const name = rest.split("/")[0];
    return name !== undefined && name !== "" && rest.includes("/") ? name : null;
  }
  return null;
}

/** The `steps` folder a file sits in (a feature's or the shared one), or null. */
export function stepsRootOf(file: string, folders: Folders): string | null {
  const owner = featureOf(file, folders);
  if (owner === null) return null;
  const root = owner === "shared" ? `${folders.shared}/steps` : `${folders.features}/${owner}/steps`;
  return isInside(file, root) ? root : null;
}

export const inStepsLayer = (file: string, folders: Folders): boolean => stepsRootOf(file, folders) !== null;

export function inStripsLayer(file: string, folders: Folders): boolean {
  const owner = featureOf(file, folders);
  return owner !== null && owner !== "shared" && isInside(file, `${folders.features}/${owner}/strips`);
}

/** True when the step file is in `<steps root>/<cls>/`. */
export function inStepClassFolder(file: string, cls: string, folders: Folders): boolean {
  const root = stepsRootOf(file, folders);
  return root !== null && isInside(file, `${root}/${cls}`);
}

/** Where a shared step file is expected, by naming convention: `src/shared/steps/<class>/<rest>.ts`. */
export function sharedStepFile(stepName: string, folders: Folders): string {
  const [cls, ...rest] = stepName.split(".");
  return `${folders.shared}/steps/${cls}/${rest.join(".")}.ts`;
}

/** A human description of where a step of class `cls` belongs, for messages. */
export function stepsLocationText(cls: string, folders: Folders): string {
  return `${folders.features}/<feature>/steps/${cls}/ or ${folders.shared}/steps/${cls}/`;
}

/** True when some feature (or src/shared) has a `steps` folder. */
export function hasStepsFolder(root: string, folders: Folders): boolean {
  if (isDir(join(root, folders.shared, "steps"))) return true;
  return featureFolders(root, folders).some((f) => isDir(join(root, folders.features, f, "steps")));
}

/** True when some feature has a `strips` folder. */
export function hasStripsFolder(root: string, folders: Folders): boolean {
  return featureFolders(root, folders).some((f) => isDir(join(root, folders.features, f, "strips")));
}

/** Names of the folders directly under the features folder. */
export function featureFolders(root: string, folders: Folders): string[] {
  const dir = join(root, folders.features);
  if (!isDir(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}
