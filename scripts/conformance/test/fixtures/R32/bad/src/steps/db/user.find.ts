export const findUser = defineStep({ name: "db.user.find", class: "db", input: UserId, output: User, permissions: { reads: ["users"], writes: ["users"], storage: [] }, errors: ["network"] });
declare const UserId: unknown;
declare const User: unknown;
declare function defineStep(x: unknown): unknown;
