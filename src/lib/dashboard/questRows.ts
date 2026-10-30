import type { CampaignLiveQuest, Quest } from "@/types/quest.types";

/**
 * Where a quest sits in its life, most urgent first.
 *
 * `here` means the quest holds a runtime cursor (a running or waiting thread).
 * Ending a session leaves every thread where it stands, so a cursor is exactly
 * where the party left the story and there is no separate paused stage.
 */
export type QuestStage = "here" | "active";

export interface DashboardQuestRowModel {
  id: string;
  title: string;
  /** The beat the party is on, or who gave the quest. Never both — the row has
   *  one line for it, and which one is useful depends on the stage. */
  secondary: string | null;
  stage: QuestStage;
  /** Straight into the cockpit, for a quest that already has a cursor. */
  runLink: boolean;
}

const RANK: Record<QuestStage, number> = { here: 0, active: 1 };

/**
 * One row per quest, merged across every reading of the data.
 *
 * The dashboard used to carry three lists — chains with a live cursor, the
 * active lane, and the rumor lane (retired entirely by #874: a rumor is now a
 * beat's visibility, not a quest stage) — and a quest being played appeared in
 * two of them at once. Stacking them in a single card did not fix that; it
 * only put the duplicate closer to its twin. So the lists become one list,
 * and a quest that is both "in progress" and "in the active lane" is one row
 * saying the more urgent of the two things.
 *
 * A cursor always wins, because where the party is standing is the strongest
 * thing you can say about a quest — and it carries the beat, which is more use
 * at a glance than who handed the quest over.
 */
export function buildQuestRows(
  chains: CampaignLiveQuest[],
  activeQuests: Quest[],
  giverName: (quest: Quest) => string | null,
): DashboardQuestRowModel[] {
  const byId = new Map<string, DashboardQuestRowModel>();

  const fromLane = (quest: Quest, stage: QuestStage) => {
    const giver = giverName(quest);
    byId.set(quest.id, {
      id: quest.id,
      title: quest.title || "Untitled Quest",
      secondary: giver ? `Given by ${giver}` : null,
      stage,
      runLink: false,
    });
  };

  for (const quest of activeQuests) fromLane(quest, "active");

  // Chains last so they overwrite the lane reading of the same quest. A chain
  // can also belong to a quest in neither lane — completed, revisited — and it
  // carries its own title, so it still gets a row.
  for (const chain of chains) {
    byId.set(chain.quest_id, {
      id: chain.quest_id,
      title: chain.quest_title || "Untitled Quest",
      secondary: chain.beat_title || null,
      stage: "here",
      runLink: true,
    });
  }

  return [...byId.values()].sort(
    (a, b) => RANK[a.stage] - RANK[b.stage] || a.title.localeCompare(b.title),
  );
}
