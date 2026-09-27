import type { Monster } from "@/types/monster.types";

/**
 * A `library_monsters` row as a `Monster`.
 *
 * A shared row belongs to no user and no campaign, and it has no cutout of its
 * own: a library monster's art, cutout included, lives in the two art tables
 * (`library_monster_art` for a DM's override, `_canonical` for the admin's) and
 * is merged on by `withLibraryArt`. Five call sites used to cast the raw row
 * straight to `Monster`, each filling in a different subset of these fields,
 * and the cast hid that `cutout_url` came back undefined rather than null (#917).
 */
export function libraryMonsterRow(row: object): Monster {
  return { ...row, user_id: "", campaign_id: null, is_shared: true, cutout_url: null } as Monster;
}
