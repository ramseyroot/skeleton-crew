// The public surface of the profile feature. Code outside the feature imports from here, and only from here.
// The page and the Server Actions are not exported: route stubs import the page file directly.

export { profileFeature } from "./feature.ts";
export { saveProfile } from "./strips/profile.save.strip.ts";
export { viewProfile } from "./strips/profile.view.strip.ts";
