/**
 * Grouping the player journal by thread (Quest Manager Redesign, frame
 * "08 Player"): "Revealed beats only, grouped by thread so parallel actually
 * reads as parallel."
 *
 * `get_player_visible_quest_beats` (#850 story J) already resolved which
 * thread each beat belongs to — folding a thread with no revealed beat of its
 * own into Main, and resolving a never-visited beat to whichever live thread
 * can still reach it. This module does the one thing left on the client:
 * turn that flat, already-resolved list into ordered columns.
 *
 * Deliberately dumb. It does not re-derive thread identity, does not re-fold
 * anything, and does not know what a `quest_threads` row looks like — every
 * beat already carries its own `thread_id`/`thread_label`, which is the point
 * of doing the fold in SQL rather than twice.
 */

import type { PlayerQuestBeat } from "@/types/quest.types";
import { threadTone, type ThreadTone } from "./threads";

export interface PlayerQuestThreadColumn {
  threadId: string;
  label: string;
  /** The eyebrow text this column heads with — the bare label for the first
   *  column, "Also following — <label>" for every other one. */
  eyebrow: string;
  /** True for exactly one column: the one holding the beats no other thread
   *  claimed first. Always present — Main is the fold target of last resort. */
  isPrimary: boolean;
  tone: ThreadTone;
  /** In `story_order`, ascending — the order the frame's cards read in. */
  beats: PlayerQuestBeat[];
}

/**
 * A revealed beat with no reveal copy is what the cockpit's "add reveal copy —
 * players see nothing without it" chip promises: nothing. It stays in the
 * journal only while it is the moment happening now, or once it paid
 * something out — a chip row with no words is still a fact; an empty card is
 * not. A rumour with no text keeps its row (the template says a rumour is
 * circulating), because "there is a rumour" is itself the information.
 */
function hasSomethingToShow(beat: PlayerQuestBeat): boolean {
  if (beat.visibility === "rumored") return true;
  return !!beat.player_text || beat.is_current || beat.payoff.length > 0;
}

/**
 * Ordered columns, Main first. Beats already filtered to rumored/revealed by
 * the RPC; this is defensive the same way `PlayerQuestStoryThread` has always
 * been about malformed cache data, never a second visibility gate.
 *
 * Column order after the first: whichever thread's earliest beat (by
 * `story_order`) comes soonest — the order the party actually met each
 * parallel layer, not creation order the client has no way to see (a beat
 * carries no `created_at` for its thread, only its own `thread_id`/`thread_label`).
 */
export function groupPlayerBeatsByThread(beats: readonly PlayerQuestBeat[]): PlayerQuestThreadColumn[] {
  const safeBeats = beats.filter((beat) => (beat.visibility === "rumored" || beat.visibility === "revealed") && hasSomethingToShow(beat));
  if (safeBeats.length === 0) return [];

  const byThread = new Map<string, PlayerQuestBeat[]>();
  for (const beat of safeBeats) {
    const list = byThread.get(beat.thread_id);
    if (list) list.push(beat);
    else byThread.set(beat.thread_id, [beat]);
  }

  const primaryThreadId = findPrimaryThreadId(safeBeats);

  const columns = [...byThread.entries()].map(([threadId, threadBeats]) => ({
    threadId,
    label: threadBeats[0]!.thread_label,
    minStoryOrder: Math.min(...threadBeats.map((beat) => beat.story_order)),
    beats: [...threadBeats].sort((a, b) => a.story_order - b.story_order || a.id.localeCompare(b.id)),
  }));

  columns.sort((a, b) => {
    if (a.threadId === primaryThreadId) return -1;
    if (b.threadId === primaryThreadId) return 1;
    return a.minStoryOrder - b.minStoryOrder || a.threadId.localeCompare(b.threadId);
  });

  return columns.map((column, index) => ({
    threadId: column.threadId,
    label: column.label,
    eyebrow: column.threadId === primaryThreadId ? column.label : `Also following — ${column.label}`,
    isPrimary: column.threadId === primaryThreadId,
    tone: threadTone(index),
    beats: column.beats,
  }));
}

/**
 * The primary column is "Main" when a Main-labelled thread is present among
 * the visible beats (true whenever the RPC has resolved at least one beat —
 * a thread with nothing of its own folds into Main, so Main always appears);
 * failing that — a defensive fallback for a malformed or pre-#850 cache
 * object with no Main row at all — the thread holding the earliest beat in
 * the story.
 */
function findPrimaryThreadId(beats: readonly PlayerQuestBeat[]): string {
  const main = beats.find((beat) => beat.thread_label === "Main");
  if (main) return main.thread_id;
  return [...beats].sort((a, b) => a.story_order - b.story_order || a.thread_id.localeCompare(b.thread_id))[0]!.thread_id;
}
