export const ok = defineStep({ name: "db.a.ok" });
export const notStep = 1;
export function helper(): number {
  return 1;
}
const local = 2;
export { local };
export default 3;
declare function defineStep(x: unknown): unknown;
