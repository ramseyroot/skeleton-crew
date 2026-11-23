export const s = defineStep({ name: "db.b.one" });
export type T = string;
export interface I {
  x: number;
}
const t = defineStep({ name: "db.b.two" });
export { t };
export { other } from "./c.ts";
declare function defineStep(x: unknown): unknown;
