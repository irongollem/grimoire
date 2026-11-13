<template>
  <section class="space-y-2 rounded-lg border border-border bg-card p-3" aria-label="Players">
    <h3 class="text-heading-sm font-bold text-foreground">Players</h3>
    <div class="flex min-h-9 items-center gap-2">
      <AudienceRevealControl :name="quest.title" :visible-to="quest.player_visible_to" @change="onRevealChange" />
    </div>
    <p class="text-caption text-muted-foreground">See {{ seenBeats }} of {{ beats.length }} beats · {{ seenObjectives }} of {{ objectives.length }} objectives</p>
    <AppButton :icon="IconReveal" label="Preview as…" size="sm" variant="subtle" @click="previewOpen = true" />
    <QuestPlayerPreviewDrawer v-if="previewOpen" :quest-id="quest.id" :visible-to="quest.player_visible_to" @close="previewOpen = false" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AudienceRevealControl from "@/components/common/reveal/AudienceRevealControl.vue";
import { sendCampaignAnnouncement } from "@/composables/campaign/useCampaignBroadcast";
import { useQuestBeats } from "@/composables/quests/useQuestFlow";
import { useQuestObjectives, useUpdateQuest } from "@/composables/quests/useQuests";
import { IconReveal } from "@/lib/icons";
import { useCampaignStore } from "@/stores/campaign";
import type { Quest } from "@/types/quest.types";
import QuestPlayerPreviewDrawer from "../run/QuestPlayerPreviewDrawer.vue";

const { quest } = defineProps<{ quest: Quest }>();
const campaign = useCampaignStore();
const questId = computed(() => quest.id);
const { data: beatRows } = useQuestBeats(questId);
const { data: objectiveRows } = useQuestObjectives(questId);
const { mutateAsync: updateQuest } = useUpdateQuest();
const previewOpen = ref(false);

const beats = computed(() => beatRows.value ?? []);
const objectives = computed(() => objectiveRows.value ?? []);
// A beat is seen once it is a rumor or revealed; an objective when it is player-visible.
const seenBeats = computed(() => beats.value.filter((beat) => beat.visibility === "rumored" || beat.visibility === "revealed").length);
const seenObjectives = computed(() => objectives.value.filter((objective) => objective.is_player_visible).length);

async function onRevealChange(next: string[]) {
  const wasShared = quest.player_visible_to.length > 0;
  await updateQuest({ id: quest.id, update: { player_visible_to: next } });
  // The first share tells the table; widening or narrowing it later does not.
  if (!wasShared && next.length && campaign.activeCampaignId) {
    void sendCampaignAnnouncement(campaign.activeCampaignId, `📋 Quest shared: "${quest.title || "Untitled Quest"}"`, {
      entity_type: "quest",
      entity_id: quest.id,
    });
  }
}
</script>
