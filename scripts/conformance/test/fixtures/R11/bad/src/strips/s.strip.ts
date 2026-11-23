export const s = defineStrip({
  name: "p.save",
  budget: { reads: R },
  routing: { "*": ACTION },
});
declare const R: string[];
declare const ACTION: string;
declare function defineStrip(x: unknown): unknown;
