// The payment provider's webhook, as a plain Request to Response function so tests can call it without Next.js.
// It does not go through the API pipeline: it needs no session or key, and a per-IP limit could drop the provider's retries.

import { errorBody, publicMessage, statusOf } from "../../lib/http.ts";
import type { Ports } from "../../lib/step.ts";
import { runStrip } from "../../lib/strip.ts";
import { webhook } from "./strips/billing.webhook.strip.ts";

/**
 * Reads the raw body (the signature covers the exact text), runs `billing.webhook` and answers:
 * 200 once the event is stored and handled (also a duplicate, an ignored event or a refused amount, so the provider
 * stops retrying), 401 for a bad signature, 400 for a signed body of an unknown shape, 500 when it should be retried.
 */
export async function handleWebhook(request: Request, ports: Ports): Promise<Response> {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return reply(400, errorBody("validation", "The request could not be read.", "unreadable"), "unreadable");
  }
  const headers: Record<string, string> = {};
  request.headers.forEach((value, name) => {
    headers[name.toLowerCase()] = value;
  });
  const result = await runStrip(webhook, ports, { headers, rawBody });
  if (result.ok) return reply(200, { data: { received: true } }, result.stripId);
  const status = statusOf(result.error.kind);
  return reply(status, errorBody(result.error.kind, publicMessage(result.error), result.stripId), result.stripId);
}

function reply(status: number, body: unknown, requestId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "x-request-id": requestId },
  });
}
