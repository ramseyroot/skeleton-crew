import { findUser } from "../steps/db/user.find.ts";
export const v = defineStrip({ name: "profile.view", steps: [findUser] });
declare function defineStrip(x: unknown): unknown;
