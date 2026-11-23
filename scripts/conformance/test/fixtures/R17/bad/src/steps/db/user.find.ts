export const findUser = defineStep({ name: "db.user.find", class: "db", input: UserEmail, output: User, permissions: { reads: ["users", "orders"], writes: ["users"], storage: [] }, errors: ["network"] });
declare const UserEmail: unknown;
declare const User: unknown;
declare function defineStep(x: unknown): unknown;
