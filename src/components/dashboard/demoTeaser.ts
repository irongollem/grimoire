/**
 * Where the full *Late in the Kind Country* campaign can be bought, or `null`
 * when there is nowhere to send anyone yet (#912).
 *
 * Pulled out of `DemoTeaserBanner` so the empty/whitespace/unset cases have
 * one answer and a test that does not need to mount anything.
 * `VITE_FULL_CAMPAIGN_URL` is optional (see `vite-env.d.ts`) and unset by
 * default everywhere, including production today (see `.env.example`) — that
 * absence is what keeps the teaser invisible until a storefront exists.
 */
export function fullCampaignUrl(): string | null {
  const raw = import.meta.env.VITE_FULL_CAMPAIGN_URL;
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}
