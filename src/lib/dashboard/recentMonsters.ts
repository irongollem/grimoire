/**
 * The join for the "Recently discovered monsters" widget (#764).
 *
 * `discovered_monsters` (src/composables/encounters/useDiscoveredMonsters.ts) rows carry
 * no monster name or art of their own — only a reference and a timestamp — so
 * the widget needs a join against the bestiary before there is anything to
 * render. A discovery's reference is one of two mutually-exclusive columns:
 * `monster_id` for a DM-created row in `monsters`, `library_monster_id` for a
 * shared row in `library_monsters` (a stable slug id, e.g. `"srd_aboleth"`;
 * see `useDiscoveredMonsters.ts` and `useCloneLibraryMonster`). Both land in
 * the same `/monsters/:id` route and the same `monsters` prop here, because
 * `useAllMonsters()` already merges custom and library rows into one bestiary
 * keyed by `id` — this module does not need to know which table a row came
 * from, only that it has one.
 */

export interface DiscoveredMonsterInput {
  monster_id: string | null;
  library_monster_id: string | null;
  /**
   * Widened past the `DiscoveredMonster` type's `string`: the whole point of
   * the null/absent case below is that this column cannot be trusted to
   * always be populated, whatever the TS type promises.
   */
  discovered_at?: string | null;
}

export interface BestiaryMonsterInput {
  id: string;
  name: string;
  image_url: string | null;
  portrait_focal_point?: { x: number; y: number } | null;
}

export interface RecentMonsterRow {
  id: string;
  name: string;
  imageUrl: string | null;
  portraitFocalPoint: { x: number; y: number } | null;
  discoveredAt: string;
}

/** Matches `useRecentNpcs`'s CAP — the two "recent" strips read as one family. */
export const RECENT_MONSTERS_LIMIT = 10;

/**
 * Newest-first discovered-monster rows, ready for the widget to render with
 * no lookups of its own.
 *
 * Three kinds of discovery are dropped rather than shown, each for the same
 * reason as `questLoot.ts` / `questActivity.ts` dropping a row whose quest is
 * gone: a partial fact is worse to render than to omit.
 *
 * - No reference at all (`monster_id` and `library_monster_id` both null) —
 *   not a real state the app writes, but not one this function should guess
 *   about either.
 * - A reference that resolves to nothing in `monsters` — the monster was
 *   deleted (custom) or its source was disabled (library) after discovery.
 *   Rendered as absent, never as a nameless placeholder row.
 * - A null or absent `discovered_at`. This is the one worth spelling out:
 *   coercing it to epoch zero would silently sort the row last, and treating
 *   it as "now" would silently sort it first — both are a fabricated fact
 *   dressed up as a real one. Since this widget's entire point is "newest
 *   first," a row with no honest position in that order is dropped rather
 *   than placed at a guess.
 */
export function deriveRecentMonsters(
  discoveries: readonly DiscoveredMonsterInput[],
  monsters: readonly BestiaryMonsterInput[],
  limit = RECENT_MONSTERS_LIMIT,
): RecentMonsterRow[] {
  const monstersById = new Map(monsters.map((monster) => [monster.id, monster]));

  const rows: RecentMonsterRow[] = [];
  for (const discovery of discoveries) {
    const monsterId = discovery.monster_id ?? discovery.library_monster_id;
    if (!monsterId) continue;
    if (!discovery.discovered_at) continue;

    const monster = monstersById.get(monsterId);
    if (!monster) continue;

    rows.push({
      id: monster.id,
      name: monster.name,
      imageUrl: monster.image_url,
      portraitFocalPoint: monster.portrait_focal_point ?? null,
      discoveredAt: discovery.discovered_at,
    });
  }

  return rows
    .sort((a, b) => new Date(b.discoveredAt).getTime() - new Date(a.discoveredAt).getTime())
    .slice(0, limit);
}
