/**
 * Resolves where the run cockpit's start card should point (#871): the
 * cockpit used to open on a bare picker, ranking computed graph roots first
 * and asking the DM to remember which beat the story actually begins on. Now
 * a quest declares an entry beat (DB-defaulted, `quests.entry_beat_id`), and a
 * bridge — an `unlock_quest` rule that promoted this quest — can name where
 * the party comes in sideways instead of at the quest's own rumor beat.
 *
 * Pure so every branch is a one-line test: no query, no component, just the
 * ordering the frame ("Start the session flow") actually needs.
 */

export interface ResolveStartBeatIdInput {
  /** `quests.entry_beat_id` — null for a quest with no beats yet, or one
   *  whose entry beat has since been archived out from under it. */
  entryBeatId: string | null;
  /** The most recent performed, not-undone `unlock_quest` event's
   *  `entry_beat_id` — null when no bridge fired, or when the bridge named
   *  no beat of its own (falls back to the target's own entry, handled by
   *  the caller reading `null` from `useQuestUnlockEntry` in that case). */
  unlockEntryBeatId: string | null;
  /** Computed graph roots (`rootBeatIds`) — the fallback when neither a
   *  bridge nor a stored entry resolves to a beat that still exists. */
  rootIds: ReadonlySet<string>;
  /** Every non-archived beat id this quest currently has. A stored id (entry
   *  or bridge) that does not appear here points at a beat that is gone. */
  beatIds: ReadonlySet<string>;
}

export type ResolveStartBeatReason = "bridge" | "entry" | "sole-root" | "ask";

export interface ResolvedStartBeat {
  /** Null only for `reason: "ask"` — nothing resolved, the DM chooses. */
  beatId: string | null;
  reason: ResolveStartBeatReason;
}

/**
 * Order: a live bridge beat first (the party was sent here sideways, on
 * purpose, by a specific rule) → the quest's own declared entry → the sole
 * computed root (legacy data, or a quest whose entry beat was archived
 * without a replacement being set yet) → ask the DM.
 */
export function resolveStartBeatId(input: ResolveStartBeatIdInput): ResolvedStartBeat {
  if (input.unlockEntryBeatId && input.beatIds.has(input.unlockEntryBeatId)) {
    return { beatId: input.unlockEntryBeatId, reason: "bridge" };
  }
  if (input.entryBeatId && input.beatIds.has(input.entryBeatId)) {
    return { beatId: input.entryBeatId, reason: "entry" };
  }
  if (input.rootIds.size === 1) {
    return { beatId: [...input.rootIds][0]!, reason: "sole-root" };
  }
  return { beatId: null, reason: "ask" };
}
