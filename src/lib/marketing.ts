// The marketing site lives on the apex domain (dungeongrimoire.com); the app is
// on app.dungeongrimoire.com. Legal pages (privacy / terms / refunds) are
// canonical on the marketing site, so we link out to them there — a single
// source of truth for legal text, no in-app duplication or drift.
export const MARKETING_URL =
  (import.meta.env.VITE_MARKETING_URL as string | undefined)?.replace(/\/$/, "") ??
  "https://dungeongrimoire.com";

export type LegalDoc = "privacy" | "terms" | "refunds";

export function legalUrl(doc: LegalDoc): string {
  return `${MARKETING_URL}/${doc}`;
}
