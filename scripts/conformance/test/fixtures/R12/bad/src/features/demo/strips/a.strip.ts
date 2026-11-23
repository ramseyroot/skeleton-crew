import { findUser } from "../steps/db/user.find.ts";
import { saveUser } from "../steps/db/user.save.ts";
export const a = defineStrip({
  name: "profile.save",
  steps: [
    findUser,
    saveUser,
  ],
  routing: { "db.user.find": { network: "retry:2" } },
});
export const b = defineStrip({ name: "profile.view", steps: [findUser] });
declare function defineStrip(x: unknown): unknown;
