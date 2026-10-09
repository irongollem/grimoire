// The marketing site lives on the apex domain (dungeongrimoire.com); the app is
// on app.dungeongrimoire.com. Legal pages (privacy / terms / refunds) are
// canonical on the marketing site, so we link out to them there — a single
// source of truth for legal text, no in-app duplication or drift.
export const MARKETING_URL =
  (import.meta.env.VITE_MARKETING_URL as string | undefined)?.replace(/\/$/, "") ??
  "https://dungeongrimoire.com";

export type LegalDoc = "privacy" | "terms" | "refunds" | "young-players";

export function legalUrl(doc: LegalDoc): string {
  return `${MARKETING_URL}/${doc}`;
}

// The community Discord, through the redirect the marketing site owns
// (`/discord` in grimoire-marketing's vercel.json) rather than a raw
// discord.gg invite, so an expired or rotated invite is fixed there without
// shipping the app. Gated on account kind: see `useDiscordInvite`.
export const DISCORD_URL = `${MARKETING_URL}/discord`;
