/**
 * Pure request-body validation for generate-character-doll, colocated so it can
 * be unit-tested without Deno's `serve`/`createClient` runtime (same reasoning
 * as generate-cutout/validateCutoutRequest.ts).
 */

export interface DollRequest {
  party_member_id: string;
}

export type DollRequestValidation =
  | { ok: true; request: DollRequest }
  | { ok: false; error: string };

/** Validates the parsed JSON body of a `generate-character-doll` request. */
export function validateDollRequest(body: unknown): DollRequestValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "invalid_body" };
  const { party_member_id } = body as Record<string, unknown>;
  if (typeof party_member_id !== "string" || !party_member_id) return { ok: false, error: "invalid_body" };
  return { ok: true, request: { party_member_id } };
}
