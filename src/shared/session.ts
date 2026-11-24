// The name of the session cookie. It lives in `src/shared/` because the accounts feature sets the cookie and
// every page that needs to know who is looking reads it, and features may not import each other (rule R42).

export const SESSION_COOKIE = "sk_session";
