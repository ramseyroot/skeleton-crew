declare function defineStep(x: unknown): unknown;
export const orphanStep = defineStep({ name: "pure.accounts.orphan", class: "pure", input: 1, output: 1, permissions: { reads: [], writes: [], storage: [] }, errors: [] });
