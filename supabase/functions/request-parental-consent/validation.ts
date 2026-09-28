/**
 * Pure request-shape validation for request-parental-consent — no Deno/https
 * imports, so vitest covers it directly (see vitest.config.ts's
 * supabase/functions include).
 */
import { isChildLoginEmail } from "../_shared/childAccount.ts";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A plausible address, within the DB's length check, and not itself a child login. */
export function isValidParentEmail(email: string): boolean {
  return email.length > 0 && email.length <= 320 && EMAIL_PATTERN.test(email) && !isChildLoginEmail(email);
}

export function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * The `sub` claim of a bearer token, or null when the token is not a user
 * session. Read WITHOUT verifying it, only to decide which path the caller is
 * on: with no session supabase-js still sends the project's anon or
 * publishable key as the bearer, and that must count as anonymous. A token
 * that claims a user must then verify, or the request is refused (see
 * index.ts); it must never fall back to the anonymous path, which would record
 * an existing account's request as a brand-new signup that can never convert.
 */
export function bearerSubject(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());
  if (!match) return null;
  const parts = match[1].split(".");
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload: unknown = JSON.parse(json);
    if (typeof payload !== "object" || payload === null) return null;
    const sub = (payload as Record<string, unknown>).sub;
    return typeof sub === "string" && sub.length > 0 ? sub : null;
  } catch {
    return null;
  }
}

/**
 * A stable uuid for an email address, used as the rate-limit key so the
 * per-address limit lives in the append-only `rate_limit_events` log without
 * the address itself being stored there. SHA-256 of a namespaced, lowercased
 * address, first 16 bytes, shaped as a uuid.
 */
export async function addressRateLimitKey(email: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`parental-consent:${email.trim().toLowerCase()}`)),
  );
  const hex = Array.from(bytes.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
