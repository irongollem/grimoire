/**
 * Canonical art for The Interlude (#486).
 *
 * Every image is admin-uploaded to `downtime-images/srd/` (migration
 * `20260713000002`) and is the same for every campaign — the eight archetype
 * card faces and the seed portraits. So the URL is a plain constant, not a DB
 * lookup, and no `srd_*` table is involved.
 *
 * Built from the env var rather than `getPublicUrl()` so the data files that
 * import it stay pure: they are loaded by the unit tests, which have no Supabase
 * client.
 */
export const DOWNTIME_ART_BASE = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/downtime-images/srd`;

/** The canonical URL for one downtime image, e.g. `art("carouse")`. */
export function art(name: string): string {
  return `${DOWNTIME_ART_BASE}/${name}.webp`;
}
