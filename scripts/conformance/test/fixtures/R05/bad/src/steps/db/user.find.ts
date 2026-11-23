export const a = defineStep({ name: "db.user.find", class: "db" });
export const b = defineStep({ name: "user.find", class: "db" });
export const c = defineStep({ name: "cache.user.find", class: "db" });
export const d = defineStep({ name: "magic.user.find", class: "magic" });
declare function defineStep(x: unknown): unknown;
