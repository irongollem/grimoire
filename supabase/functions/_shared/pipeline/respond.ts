// The request half of the AI pipeline (#1234): one error shape, one way to read a body, one way to learn who is
// calling. Pure, so it is unit-tested under vitest; `serveUser.ts` is the Deno-facing wrapper that wires it to CORS,
// supabase-js and Sentry.
//
// Every refusal is JSON `{ error, message? }`: `error` is a stable code a client may branch on, `message` the
// sentence a person reads. The client's `edgeErrorMessage` shows `message` when there is one, so a function never has
// to choose between a code and a readable answer. Functions used to mix plain text and JSON inside one handler.

import type { SupabaseClient, User } from "@supabase/supabase-js";

const JSON_HEADERS = { "Content-Type": "application/json" };

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** A refusal: a stable code, and the sentence to show when the code alone would not read well. */
export function jsonError(status: number, error: string, message?: string, extra?: Record<string, unknown>): Response {
  return json({ error, ...(message === undefined ? {} : { message }), ...extra }, status);
}

/** The request body as an object, or null when it is not a JSON object (a 400 for the caller to give). */
export async function readJsonBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json();
    return body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export interface UserRequest {
  req: Request;
  user: User;
  /** The caller's own `Authorization` header, for a client that must act as them. */
  authHeader: string;
  /** A client that acts as the caller, so RLS applies. */
  userClient: SupabaseClient;
}

/**
 * Who is calling, or the refusal to answer with. The client is made by the caller so this stays pure: `serveUser`
 * passes supabase-js, a test passes a fake.
 */
export async function authenticate(
  req: Request,
  methods: readonly string[],
  clientFor: (authHeader: string) => SupabaseClient,
): Promise<UserRequest | Response> {
  if (!methods.includes(req.method)) return jsonError(405, "method_not_allowed");
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonError(401, "unauthorized", "Sign in again to continue.");
  const userClient = clientFor(authHeader);
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return jsonError(401, "unauthorized", "Sign in again to continue.");
  return { req, user: data.user, authHeader, userClient };
}

/** The answer to a request over its rate limit (`checkRateLimit` said no). */
export function rateLimited(): Response {
  return jsonError(429, "rate_limited", "That's a lot of requests in a short time. Wait a minute and try again.");
}
