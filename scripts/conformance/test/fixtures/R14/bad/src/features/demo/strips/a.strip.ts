import { findUser } from "../steps/db/user.find.ts";
import { saveUser } from "../steps/db/user.save.ts";
export const a = defineStrip({ name: "profile.save", steps: [findUser, saveUser] });
declare function defineStrip(x: unknown): unknown;
