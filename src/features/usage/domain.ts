// Shared by the usage steps, strips and page. Schemas live here because a step file may export only steps (R09).

import { z } from "zod";
import type { CollectionDef } from "../../ports/database.ts";

/**
 * One row per key (or session), endpoint and day. `monthKey` groups a month of one account's rows, so the monthly
 * quota and the usage page read the same rows (design G3).
 */
export const USAGE_COUNTERS: CollectionDef = {
  name: "usage_counters",
  fields: {
    counterKey: { type: "string", unique: true },
    monthKey: { type: "string", indexed: true },
    accountId: { type: "string" },
    endpoint: { type: "string" },
    day: { type: "string" },
    ok: { type: "number" },
    clientError: { type: "number" },
    serverError: { type: "number" },
  },
};
export const collections: CollectionDef[] = [USAGE_COUNTERS];

export const PrincipalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user"), accountId: z.string(), role: z.enum(["user", "admin"]) }),
  z.object({ kind: z.literal("key"), accountId: z.string(), keyId: z.string(), role: z.enum(["user", "admin"]) }),
  z.object({ kind: z.literal("anonymous"), ip: z.string() }),
]);

export const OutcomeSchema = z.enum(["ok", "client_error", "server_error"]);
export type Outcome = z.infer<typeof OutcomeSchema>;

export const RecordRequestSchema = z.object({
  accountId: z.string().min(1),
  /** The key id, or "session" for a request made with a browser session. */
  subject: z.string().min(1),
  endpoint: z.string().min(1),
  outcome: OutcomeSchema,
});

export const CounterSchema = z.object({ counterKey: z.string(), total: z.number().int() });

export const MonthRowsSchema = z.object({
  month: z.string(),
  rows: z.array(z.object({ endpoint: z.string(), day: z.string(), ok: z.number(), clientError: z.number(), serverError: z.number() })),
});

export const EndpointUsageSchema = z.object({
  endpoint: z.string(),
  ok: z.number(),
  clientError: z.number(),
  serverError: z.number(),
  total: z.number(),
});
export const UsageMonthSchema = z.object({ month: z.string(), total: z.number(), byEndpoint: z.array(EndpointUsageSchema) });
export type UsageMonth = z.infer<typeof UsageMonthSchema>;

/** `2026-11` from an ISO time. */
export const monthOf = (iso: string): string => iso.slice(0, 7);
