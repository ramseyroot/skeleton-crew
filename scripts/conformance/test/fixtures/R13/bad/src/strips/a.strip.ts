import { findUser } from "../steps/db/user.find.ts";
import { saveUser } from "../steps/db/user.save.ts";
import { putAvatar } from "../steps/storage/avatar.put.ts";
export const a = defineStrip({
  name: "profile.save",
  budget: { reads: ["users"], writes: [], storage: ["avatars/*"] },
  steps: [findUser, saveUser, putAvatar],
});
export const c = defineStrip({ name: "profile.view", steps: [findUser] });
declare function defineStrip(x: unknown): unknown;
