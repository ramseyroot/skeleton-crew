export const putAvatar = defineStep({ name: "storage.avatar.put", class: "storage", permissions: { reads: [], writes: [], storage: ["avatars/user-1/*"] } });
declare function defineStep(x: unknown): unknown;
