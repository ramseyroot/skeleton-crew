const NAME = "db.a.one";
const READS = ["users"];
export const a = defineStep({ name: NAME, class: "db", permissions: { reads: READS, writes: [], storage: [] }, errors: ["network"] });
declare function defineStep(x: unknown): unknown;
