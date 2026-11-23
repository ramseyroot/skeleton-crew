import { findUser } from "../steps/db/user.find.ts";
export const o = defineStrip({ name: "orders.list", steps: [findUser] });
declare function defineStrip(x: unknown): unknown;
