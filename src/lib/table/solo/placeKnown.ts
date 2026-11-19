/** The few fields of a place this needs; the Atlas's own row has them all. */
export interface PlaceForScene {
  player_summary: string | null;
  player_visible_to: readonly string[] | null;
}

/**
 * What the scene column may say about the place: its player summary (the text the DM wrote for players), and only
 * once the place has been shown to the character being played. The page reads the DM's own row, which holds far
 * more, so this is the one gate between that row and the column that "only ever shows what the character knows".
 * Play shows a place to the character when a turn there is kept, so the summary appears after the opening.
 */
export function placeSummaryFor(place: PlaceForScene | null | undefined, memberId: string | null): string | null {
  if (!place || memberId === null) return null;
  if (!(place.player_visible_to ?? []).includes(memberId)) return null;
  const summary = place.player_summary?.trim();
  return summary ? summary : null;
}
