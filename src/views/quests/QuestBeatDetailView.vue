<template>
  <PageHeader :title="beat?.title || 'Quest beat'" :description="quest?.title">
    <div v-if="isLoading" class="flex justify-center py-16"><LoadingSpinner /></div>
    <div v-else-if="beat" class="mx-auto w-full max-w-5xl space-y-4 pb-12">
      <div class="flex flex-wrap items-center gap-2">
        <AppButton :to="returnTo" label="Back to story flow" size="sm" variant="subtle" />
        <span class="text-caption text-muted-foreground">Long-form editor · autosaves to the same beat as the inspector</span>
      </div>

      <section class="rounded-xl border border-border bg-background p-4 sm:p-6">
        <QuestBeatFields :key="beat.id" :beat="beat" />
      </section>

      <QuestBeatAttachmentsPanel :beat="beat" :attachments="attachments" />
      <QuestBeatObjectivesPanel :beat="beat" :edges="edgesQuery.data.value ?? []" />
      <QuestBeatLootPanel :beat="beat" :loot="loot" />

      <section class="rounded-lg border border-border bg-card p-3">
        <h2 class="font-cinzel text-sm font-bold text-foreground">Outgoing branches</h2>
        <ul v-if="outgoing.length" class="mt-2 space-y-1 text-caption">
          <li v-for="edge in outgoing" :key="edge.id">
            <span class="text-muted-foreground">{{ edge.label || "Continue" }} → </span>
            <strong>{{ beatTitle(edge.target_beat_id) }}</strong>
          </li>
        </ul>
        <p v-else class="mt-1 text-caption italic text-muted-foreground">No authored next beat yet. Add routes in Story flow.</p>
      </section>
    </div>
    <p v-else class="py-16 text-center text-body text-muted-foreground">This beat is missing or unavailable.</p>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useQuest } from "@/composables/quests/useQuests";
import { useQuestBeat, useQuestBeatAttachmentSummaries, useQuestBeatEdges, useQuestBeatLoot, useQuestBeats } from "@/composables/quests/useQuestFlow";
import { safeQuestReturnTo } from "@/lib/quests/navigation";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import AppButton from "@/components/common/AppButton.vue";
import QuestBeatAttachmentsPanel from "@/components/quests/QuestBeatAttachmentsPanel.vue";
import QuestBeatObjectivesPanel from "@/components/quests/QuestBeatObjectivesPanel.vue";
import QuestBeatFields from "@/components/quests/QuestBeatFields.vue";
import QuestBeatLootPanel from "@/components/quests/QuestBeatLootPanel.vue";

const route = useRoute();
const questId = computed(() => route.params.id as string);
const beatId = computed(() => route.params.beatId as string);
const { data: quest, isLoading: questLoading } = useQuest(questId);
const beatQuery = useQuestBeat(beatId);
const beatsQuery = useQuestBeats(questId);
const edgesQuery = useQuestBeatEdges(questId);
const attachmentsQuery = useQuestBeatAttachmentSummaries(questId);
const lootQuery = useQuestBeatLoot(questId);
const beat = computed(() => beatQuery.data.value?.quest_id === questId.value ? beatQuery.data.value : null);
const attachments = computed(() => (attachmentsQuery.data.value ?? []).filter((row) => row.beat_id === beatId.value));
const loot = computed(() => (lootQuery.data.value ?? []).filter((row) => row.beat_id === beatId.value));
const outgoing = computed(() => (edgesQuery.data.value ?? []).filter((edge) => edge.source_beat_id === beatId.value));
const isLoading = computed(() => questLoading.value || beatQuery.isLoading.value || attachmentsQuery.isLoading.value || lootQuery.isLoading.value);
const returnTo = computed(() => safeQuestReturnTo(route.query.returnTo, `/quests/${questId.value}?beat=${beatId.value}`));

function beatTitle(id: string) {
  return beatsQuery.data.value?.find((row) => row.id === id)?.title || "Missing beat";
}
</script>
