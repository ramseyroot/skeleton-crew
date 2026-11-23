export const a = defineStep({
  name: "db.a.one",
  class: "db",
  input: In,
});
export const b = defineStep({ name: "db.a.two", class: "db", input: In, output: Out, permissions: { reads: [] }, errors: [] });
declare const In: unknown;
declare const Out: unknown;
declare function defineStep(x: unknown): unknown;
