/**
 * Pure request-shape validation for child-account — no Deno/https imports, so
 * vitest covers it directly (see vitest.config.ts's supabase/functions
 * include). The age/login-name rules themselves live in the shared
 * _shared/childAccount.ts; this module only narrows `unknown` JSON bodies and
 * classifies the two ambiguous errors index.ts has to map to a specific code.
 */
import type { BirthMonth } from "../_shared/childAccount.ts";

export function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** `{ month, year }` shaped as numbers, or null for anything else — malformed input is just as invalid as an out-of-range one. */
export function parseBirth(value: unknown): BirthMonth | null {
  if (typeof value !== "object" || value === null) return null;
  const month = (value as Record<string, unknown>).month;
  const year = (value as Record<string, unknown>).year;
  if (typeof month !== "number" || typeof year !== "number") return null;
  return { month, year };
}

export function isValidDisplayName(name: string): boolean {
  return name.length >= 1 && name.length <= 40;
}

export function isValidPassword(password: string): boolean {
  return password.length >= 8;
}

/**
 * Supabase auth's "this email is already registered" on createUser/
 * updateUserById. Message-matched rather than code-matched: the JS SDK
 * doesn't guarantee a stable `code` across providers/versions, but the
 * message text has been consistent, and matching both is cheap insurance.
 */
export function isDuplicateEmailError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { message?: unknown; code?: unknown };
  if (e.code === "email_exists") return true;
  const message = typeof e.message === "string" ? e.message.toLowerCase() : "";
  return message.includes("already been registered") || message.includes("already registered");
}

/** A Postgres unique-violation (23505) on child_accounts.login_name specifically, not some other constraint on the same table. */
export function isLoginNameUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown };
  return e.code === "23505" && typeof e.message === "string" && e.message.includes("login_name");
}
