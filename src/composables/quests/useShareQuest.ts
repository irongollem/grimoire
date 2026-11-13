import { useQueryClient } from "@tanstack/vue-query";
import { sendCampaignAnnouncement } from "@/composables/campaign/useCampaignBroadcast";
import { partyListQuery } from "@/composables/party/useParty";
import { QUESTS_KEY, fetchQuest, useUpdateQuest } from "@/composables/quests/useQuests";
import { useCampaignStore } from "@/stores/campaign";
import type { Quest, QuestBeatVisibility } from "@/types/quest.types";

/**
 * The one place a quest's audience is written and announced. The Players section
 * and a beat's visibility control both go through it, so "Quest shared" is told
 * once, in one wording, however the first share came about.
 */
export function useShareQuest() {
  const campaign = useCampaignStore();
  const queryClient = useQueryClient();
  const { mutateAsync: updateQuest } = useUpdateQuest();

  /** Writes the audience; the first share (nobody before, somebody now) tells the table. */
  async function shareQuest(quest: Pick<Quest, "id" | "title" | "player_visible_to">, next: string[]) {
    const wasShared = quest.player_visible_to.length > 0;
    await updateQuest({ id: quest.id, update: { player_visible_to: next } });
    if (!wasShared && next.length && campaign.activeCampaignId) {
      void sendCampaignAnnouncement(campaign.activeCampaignId, `📋 Quest shared: "${quest.title || "Untitled Quest"}"`, {
        entity_type: "quest",
        entity_id: quest.id,
      });
    }
  }

  /**
   * A beat going Rumored or Revealed on a quest nobody can see shares the quest
   * with the whole party. A quest the DM shared with some members is left alone,
   * and Hidden never shares. The quest is read fresh, not from a list on screen,
   * so a share made a moment ago is not overwritten.
   */
  async function shareIfBeatSeen(questId: string, visibility: QuestBeatVisibility) {
    if (visibility === "hidden") return;
    const campaignId = campaign.activeCampaignId;
    if (!campaignId) return;
    const quest = await queryClient.fetchQuery({ queryKey: [QUESTS_KEY, questId], queryFn: () => fetchQuest(questId), staleTime: 0 });
    if (quest.player_visible_to.length > 0) return;
    const party = await queryClient.fetchQuery(partyListQuery(campaignId));
    if (party.length === 0) return;
    await shareQuest(quest, party.map((member) => member.id));
  }

  return { shareQuest, shareIfBeatSeen };
}
