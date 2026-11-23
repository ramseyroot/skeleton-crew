import { findUser } from "../steps/db/user.find.ts";
export const a = defineStrip({
  name: "profile.view",
  steps: [findUser],
  routing: { "db.user.find": { network: "retry:2" }, "*": "abort" },
});
declare function defineStrip(x: unknown): unknown;
