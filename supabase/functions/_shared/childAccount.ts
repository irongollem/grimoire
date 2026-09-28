/**
 * Parent-managed accounts for players under 16 (#919): the rules both sides of
 * the wire must agree on. Pure, no imports, so the client reaches it through
 * the `@edge-shared` alias and the edge functions import it directly, and the
 * age and login-name rules cannot drift between the form and the server.
 *
 * Schema and the reasoning behind it: migration 20260928053257_child_accounts.
 */

/** The age from which a person consents for themselves (GDPR Art 8; NL UAVG art 5). */
export const ADULT_AGE = 16;

/**
 * Version of the parental-consent wording shown on "Add a child player".
 * Recorded per child in `child_accounts.consent_version`. Bump it whenever the
 * wording changes materially.
 */
export const PARENTAL_CONSENT_VERSION = "2026-09-28";

/**
 * A child account has no email of its own. Supabase auth still needs one, so
 * it gets an address on this domain, derived from the login name. `.invalid`
 * is reserved (RFC 2606) and can never resolve, so nothing Grimoire or Supabase
 * sends can reach anyone, by construction rather than by a filter.
 */
export const CHILD_LOGIN_DOMAIN = "players.dungeongrimoire.invalid";

/** Mirrors the `child_accounts.login_name` check constraint. */
export const LOGIN_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{2,29}$/;

export function normalizeLoginName(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidLoginName(input: string): boolean {
  return LOGIN_NAME_PATTERN.test(normalizeLoginName(input));
}

export function childLoginEmail(loginName: string): string {
  return `${normalizeLoginName(loginName)}@${CHILD_LOGIN_DOMAIN}`;
}

export function isChildLoginEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${CHILD_LOGIN_DOMAIN}`);
}

/**
 * What the sign-in form's single field means: anything with an `@` is an email,
 * anything else is a child's login name. Deterministic, so signing in by login
 * name needs no lookup, and therefore no endpoint that says whether a name exists.
 */
export function signInEmail(identifier: string): string {
  const trimmed = identifier.trim();
  return trimmed.includes("@") ? trimmed : childLoginEmail(trimmed);
}

export interface BirthMonth {
  /** 1–12 */
  month: number;
  year: number;
}

/**
 * The first day this person counts as 16, as `YYYY-MM-DD`: the first of the
 * month after the month of their 16th birthday. Only a month and year are ever
 * asked, so rounding up is what keeps the answer on the safe side, and it is
 * the only thing stored (`child_accounts.adult_on`), never the birth date.
 */
export function adultOn({ month, year }: BirthMonth): string {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + ADULT_AGE + 1 : year + ADULT_AGE;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
}

/** `today` as a UTC calendar date, `YYYY-MM-DD`. */
export function isoDate(today: Date): string {
  return today.toISOString().slice(0, 10);
}

/** True while `today` is before `adultOn`. ISO dates compare as strings. */
export function isUnderAdultAge(birth: BirthMonth, today: Date): boolean {
  return isoDate(today) < adultOn(birth);
}

/**
 * A plausible birth month: a real month, not in the future, not older than any
 * living person. Anything else is a typo, not an age.
 */
export function isValidBirthMonth({ month, year }: BirthMonth, today: Date): boolean {
  if (!Number.isInteger(month) || !Number.isInteger(year)) return false;
  if (month < 1 || month > 12) return false;
  const thisYear = today.getUTCFullYear();
  if (year < thisYear - 120 || year > thisYear) return false;
  if (year === thisYear && month > today.getUTCMonth() + 1) return false;
  return true;
}
