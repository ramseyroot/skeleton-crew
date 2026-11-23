export const a = defineStep({ name: "db.a.one", class: "db", input: In, permissions: { reads: ["users"], writes: [], storage: [] }, errors: ["network"] });
declare const In: unknown;
declare function defineStep(x: unknown): unknown;
