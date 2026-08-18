/**
 * Marking the rows that "Populate Setting" put there.
 *
 * Content Grimoire ships is free content and must not eat a user's free-tier
 * allowance. The database enforces that in `check_quota`, which skips rows whose
 * `setting_source` is set — the same rule it already applied to sounds via
 * `library_id` and playlists via `library_scene_slug`. This is the half that
 * writes the mark.
 *
 * It matters more than a tidy-up: free caps are 5 factions, 5 deities, 3
 * pantheons and 10 locations, while populating Faerûn inserts 15, 112, 13 and 35
 * — and "Populate Planes" adds 20 locations more. Every one of the nine settings
 * exceeds the location cap on its own, so the Atlas button had never worked for a
 * free user on any setting. `enforce_quota` is a BEFORE INSERT trigger, so before
 * this existed pressing the button on the page returned a paywall instead of the
 * content.
 *
 * Lives in `lib/populateSetting/` rather than at `lib/` root: the module-placement
 * rule sends logic owned by one feature to a feature folder, and "Populate
 * Setting" is one feature even though it is implemented across four mutations in
 * three composables (`usePopulateFactions`, `usePopulateDeities`,
 * `usePopulateLocations`, `usePopulatePlanarLocations`). Root is for genuinely
 * cross-cutting infrastructure; a helper that exists to serve one button is not
 * that, however many places the button appears.
 */
import { supabase } from "@/lib/supabase";

/** The four tables whose seeded rows are exempt from quota counting. */
export type SettingContentTable = "factions" | "deities" | "pantheons" | "locations";

/**
 * `setting_source` for the twenty standard planes. They ship with the app but
 * belong to no single setting, so they cannot be attributed to a calendar key
 * the way every other seeded row is.
 */
export const PLANAR_SOURCE = "planar";

/**
 * Stamps `setting_source` on rows that came from a setting but predate the
 * column — the repair path for campaigns populated before this shipped.
 *
 * There is no SQL backfill, deliberately: the setting definitions live in
 * `src/settings/*.ts`, so a migration would have to carry several hundred names
 * as a literal — a second copy of the source data, stale the moment a setting
 * changes, and matched on a name the user is free to have edited. Pressing
 * Populate Setting again repairs the campaign instead, reusing the one copy of
 * that data and the same name matching that created the rows.
 *
 * `is("setting_source", null)` rather than a blind update, so re-running is
 * idempotent and a row already attributed to another setting is left alone.
 *
 * @returns how many rows were newly stamped
 */
export async function stampSettingSource(
  table: SettingContentTable,
  ids: readonly string[],
  settingKey: string,
): Promise<number> {
  if (!ids.length) return 0;

  const { data, error } = await supabase
    .from(table)
    .update({ setting_source: settingKey })
    .in("id", [...ids])
    .is("setting_source", null)
    .select("id");
  if (error) throw error;

  return (data ?? []).length;
}

/**
 * The ids of already-present rows whose name matches something the setting
 * ships, which is exactly the test both populate paths already use to decide
 * what *not* to insert. Case-insensitive for the same reason they are.
 */
export function matchSettingRowIds(
  existing: readonly { id: string; name: string }[],
  seedNames: readonly string[],
): string[] {
  const seeded = new Set(seedNames.map((n) => n.toLowerCase()));
  return existing.filter((row) => seeded.has(row.name.toLowerCase())).map((row) => row.id);
}
