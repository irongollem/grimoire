import { groupPlayerBeatsByThread } from "@/lib/quests/playerThreads";
import type { PlayerQuestBeat } from "@/types/quest.types";

export interface HearthQuestInput {
  id: string;
  title: string;
  status: string;
  updated_at: string;
}

export interface CurrentBeatLine {
  /** The thread's player-facing label; null when only one thread is current, since naming the sole thread says nothing. */
  threadLabel: string | null;
  text: string;
}

export interface HearthQuestNow {
  questId: string;
  title: string;
  current: CurrentBeatLine[];
}

/**
 * "What is happening now" per active quest: the player text of every beat a
 * live thread cursor stands on (`is_current`). Threads come out in
 * `groupPlayerBeatsByThread`'s order (Main first, then the order the party met
 * them), run over ALL the quest's beats so "Main" is recognised even when it
 * is not itself current. Quests are newest-updated first; a quest with no
 * current beat stays, with an empty `current`.
 */
export function currentBeatsByQuest(
  quests: readonly HearthQuestInput[],
  beats: readonly PlayerQuestBeat[],
): HearthQuestNow[] {
  return quests
    .filter((q) => q.status === "active")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map((q) => {
      const columns = groupPlayerBeatsByThread(beats.filter((b) => b.quest_id === q.id));
      const lines = columns.flatMap((column) =>
        column.beats
          .filter((b) => b.is_current && b.player_text !== null && b.player_text.trim() !== "")
          .map((b) => ({ label: column.label, text: b.player_text!.trim() })),
      );
      const threadCount = new Set(lines.map((l) => l.label)).size;
      return {
        questId: q.id,
        title: q.title,
        current: lines.map((l) => ({ threadLabel: threadCount > 1 ? l.label : null, text: l.text })),
      };
    });
}
