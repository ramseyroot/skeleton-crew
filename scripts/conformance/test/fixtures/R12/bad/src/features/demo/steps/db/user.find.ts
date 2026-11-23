export const findUser = defineStep({ name: "db.user.find", class: "db", permissions: { reads: ["users"], writes: [], storage: [] } });
declare function defineStep(x: unknown): unknown;
