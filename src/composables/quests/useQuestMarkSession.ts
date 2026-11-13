import { computed } from "vue";
import { useCampaignSession } from "@/composables/campaign/useCampaignSession";
import { useCampaignSessions } from "@/composables/sessions/useCampaignSessions";
import { markSessionLabel, resolveMarkSessionId } from "@/lib/quests/markSession";
import { useCampaignStore } from "@/stores/campaign";
import { useQuestsUiStore } from "@/stores/ui/quests";

/**
 * The session the quest's marks are filed under: the DM's choice for this
 * campaign, else the open session, else the last one played. `sessionId` is both what
 * the picker shows and what a mark carries; null when the campaign has no sessions.
 */
export function useQuestMarkSession() {
  const campaign = useCampaignStore();
  const ui = useQuestsUiStore();
  const { data } = useCampaignSessions();
  const { session, isRunning } = useCampaignSession();
  const log = computed(() => data.value ?? []);
  const choice = computed(() => (campaign.activeCampaignId ? ui.markSessionChoiceFor(campaign.activeCampaignId).value : ""));
  const sessionId = computed(() => resolveMarkSessionId(log.value, isRunning.value ? session.value?.id ?? null : null, choice.value));
  const options = computed(() => log.value.map((row) => ({ id: row.id, label: markSessionLabel(row) })));
  function choose(next: string) {
    if (campaign.activeCampaignId) ui.markSessionChoiceFor(campaign.activeCampaignId).value = next;
  }
  return { sessionId, options, choose };
}
