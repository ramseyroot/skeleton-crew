// The public surface of the accounts feature. Code outside the feature imports from here, and only from here.
// The pages and the Server Actions are not exported: route stubs import the page file directly.

export { accountsFeature } from "./feature.ts";
export { SESSION_COOKIE } from "./domain.ts";
export type { AccountView } from "./domain.ts";
export { login } from "./strips/accounts.login.strip.ts";
export { logout } from "./strips/accounts.logout.strip.ts";
export { me } from "./strips/accounts.me.strip.ts";
export { signup } from "./strips/accounts.signup.strip.ts";
export { start } from "./strips/accounts.start.strip.ts";
export { whoami } from "./strips/accounts.whoami.strip.ts";
export { meEndpoint } from "./endpoint.ts";
