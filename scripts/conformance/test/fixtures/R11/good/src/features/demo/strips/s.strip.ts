export const s = defineStrip({
  name: "p.save",
  budget: { reads: ["users"], writes: [], storage: [] },
  invalidates: [],
  routing: { "db.a.one": { network: "retry:2" }, "*": "abort" },
});
declare function defineStrip(x: unknown): unknown;
