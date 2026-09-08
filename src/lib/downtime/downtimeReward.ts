/**
 * Presenting a downtime outcome's reward.
 *
 * Phase 2 generalised what a draw *mints* from npc to npc/item/note, but both
 * boards kept resolving names for `npc` alone and fell through to the absence
 * marker for everything else. So every item and note reward ever handed out has
 * displayed as "??? (no longer exists)" while the row sat perfectly intact in
 * the campaign — the exact lie `DowntimeOutcomeVignette` documents that it must
 * never tell. Centralised here so the next reward kind is a case, not a fourth
 * copy of the same switch.
 */
import type { DowntimeRewardType } from "@/types/downtime.types";

/**
 * The kinds anything can actually create today: seeds mint npc/item/note
 * (`downtimeSeedReward.ts`) and the prep picker offers the same three, even
 * though the table's CHECK allows all six.
 *
 * The distinction matters for what an unresolved reward is allowed to claim. A
 * DM owns every row, so an npc/item/note they cannot see really is gone; a
 * spell/quest/faction they cannot see was simply never looked up, and saying
 * "no longer exists" about it would be a guess dressed as a fact.
 */
export const RESOLVABLE_REWARD_TYPES: readonly DowntimeRewardType[] = ["npc", "item", "note"];

export function isResolvableRewardType(type: DowntimeRewardType): boolean {
  return RESOLVABLE_REWARD_TYPES.includes(type);
}

/**
 * Where a reward lives once it exists — DM routes.
 *
 * Worth centralising precisely because the path does not follow from the type
 * name: an `item` is at `/vault/:id`, not `/items/:id`, so a call site that
 * derives the path from the noun hands the reader a 404 on a link the vignette
 * promised was real.
 */
export function downtimeRewardHref(type: DowntimeRewardType, id: string): string {
  switch (type) {
    case "npc":
      return `/npcs/${id}`;
    case "item":
      return `/vault/${id}`;
    case "note":
      return `/notes/${id}`;
    case "spell":
      return `/spells/${id}`;
    case "quest":
      return `/quests/${id}`;
    case "faction":
      return `/factions/${id}`;
  }
}

/**
 * What to call a reward that exists but this reader cannot see yet.
 *
 * Seed rewards are minted private and hidden from players, so a player reads
 * the outcome before they can read the thing it created. That gap must never be
 * reported as "no longer exists" — it is a lie the player catches out the
 * moment the DM shares it.
 *
 * Deliberately voice-neutral rather than addressed to the player ("your DM will
 * introduce them", as the npc case used to read): the same label renders on the
 * DM's own board for the kinds it does not resolve, where second-person
 * instructions to the DM about the DM are nonsense.
 *
 * The vignette prints the type beside this, so each reads as a phrase: "Item —
 * not yet handed over".
 */
export function pendingRewardLabel(type: DowntimeRewardType): string {
  switch (type) {
    case "npc":
      return "not yet introduced";
    case "item":
      return "not yet handed over";
    case "note":
    case "spell":
    case "quest":
    case "faction":
      return "not yet shared";
  }
}
