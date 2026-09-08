import type { PlayerQuestBeat } from "@/types/quest.types";

export type StagedBeat = Pick<PlayerQuestBeat, "id" | "visibility" | "story_order" | "staged_at_location_id">;

/**
 * Which site the journal's map (#798) should draw for a quest: the DM's own
 * staging, when there is any to read yet.
 *
 * `staged_at_location_id` (#797) reaches a player only through
 * `get_player_visible_quest_beats`, and only for a beat that is `revealed` —
 * a rumored beat's staging is withheld server-side, the same spoiler split
 * the rumor/reveal boundary exists to enforce everywhere else, so it never
 * even arrives here as a candidate.
 *
 * "Most recently revealed" is judged by `story_order` — position along the
 * authored flow — not by a reveal timestamp, matching
 * `PlayerQuestStoryThread`'s own "Confirmed journey" ordering (see
 * `context/features/quests.md`: "The player thread orders by story_order,
 * not by reveal time"). A tie breaks on beat id — arbitrary, but stable
 * across renders and independent of input order.
 *
 * `fallbackLocationId` — the quest's own `location_id` — wins only when no
 * revealed beat stages anywhere yet. This function does not re-validate it:
 * a caller that must gate the fallback on what's actually shared with the
 * player (as `PlayerQuestDetailView` does via `sharedLocationIds`) has to do
 * that before passing it in. The staged candidate needs no such gate here —
 * it already passed through the player-safe RPC, and the map widget's own
 * RPC call authorizes again before showing anything.
 */
export function resolveQuestSiteLocationId(
  beats: readonly StagedBeat[],
  fallbackLocationId: string | null,
): string | null {
  const staged = beats.filter(
    (beat) => beat.visibility === "revealed" && beat.staged_at_location_id !== null,
  );
  if (!staged.length) return fallbackLocationId;

  const [mostRecent] = [...staged].sort(
    (a, b) => b.story_order - a.story_order || a.id.localeCompare(b.id),
  );
  return mostRecent!.staged_at_location_id;
}
