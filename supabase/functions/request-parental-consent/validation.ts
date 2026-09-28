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
