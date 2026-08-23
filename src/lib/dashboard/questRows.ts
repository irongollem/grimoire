import type { CampaignLiveQuest, Quest } from "@/types/quest.types";

/**
 * Where a quest sits in its life, most urgent first.
 *
 * `here` and `paused` both mean the quest holds a runtime cursor. Keeping them
 * apart matters because `end_campaign_quest_session` pauses every open chain
 * when the table closes, so treating "has a cursor" as "is being played" would
 * claim the party is standing in six scenes on a Sunday afternoon.
 */
export type QuestStage = "here" | "paused" | "active" | "rumor";

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

const RANK: Record<QuestStage, number> = { here: 0, paused: 1, active: 2, rumor: 3 };

/**
 * One row per quest, merged across every reading of the data.
 *
 * The dashboard used to carry three lists — chains with a live cursor, the
 * active lane, and the rumor lane — and a quest being played appeared in two of
 * them at once. Stacking them in a single card did not fix that; it only put
 * the duplicate closer to its twin. So the lists become one list, and a quest
 * that is both "in progress" and "in the active lane" is one row saying the more
 * urgent of the two things.
 *
 * A cursor always wins, because where the party is standing is the strongest
 * thing you can say about a quest — and it carries the beat, which is more use
 * at a glance than who handed the quest over.
 */
export function buildQuestRows(
  chains: CampaignLiveQuest[],
  activeQuests: Quest[],
  rumorQuests: Quest[],
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
  for (const quest of rumorQuests) fromLane(quest, "rumor");

  // Chains last so they overwrite the lane reading of the same quest. A chain
  // can also belong to a quest in neither lane — completed, revisited — and it
  // carries its own title, so it still gets a row.
  for (const chain of chains) {
    byId.set(chain.quest_id, {
      id: chain.quest_id,
      title: chain.quest_title || "Untitled Quest",
      secondary: chain.beat_title || null,
      stage: chain.runtime_status === "running" ? "here" : "paused",
      runLink: true,
    });
  }

  return [...byId.values()].sort(
    (a, b) => RANK[a.stage] - RANK[b.stage] || a.title.localeCompare(b.title),
  );
}
