export const a = defineStep({
  name: "db.a.one",
  class: "db",
  input: In,
  output: Out,
  permissions: { reads: ["users"], writes: [], storage: [] },
  errors: ["network"],
});
declare const In: unknown;
declare const Out: unknown;
declare function defineStep(x: unknown): unknown;
