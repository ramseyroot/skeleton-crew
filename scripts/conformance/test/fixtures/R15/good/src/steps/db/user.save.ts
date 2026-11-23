export const saveUser = defineStep({ name: "db.user.save", class: "db", permissions: { reads: ["users"], writes: ["users"], storage: [] } });
declare function defineStep(x: unknown): unknown;
