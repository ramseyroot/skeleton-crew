export const saveUser = defineStep({ name: "db.user.save", class: "db", input: User, output: User, permissions: { reads: [], writes: ["users"], storage: [] }, errors: ["conflict"] });
declare const User: unknown;
declare function defineStep(x: unknown): unknown;
