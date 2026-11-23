// Clock port. Time comes from here, never from `new Date()` inside steps, so tests can fix it.
//
// Semantics: `now()` returns an ISO 8601 UTC string with milliseconds and a trailing "Z"
// (for example "2026-11-23T12:00:00.000Z"). It never fails.
//
// Adapters: system, fixed (settable, for tests and demos).

export interface Clock {
  now(): string;
}
