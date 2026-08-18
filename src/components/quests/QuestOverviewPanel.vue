<template>
  <!--
    This was a right-hand drawer behind `?overview=true`, with no affordance
    anywhere pointing at it. That framing said "aside" about the one surface
    that holds the quest's premise, its metadata, its lifecycle and the
    story-overview beat — the front page of the quest, reached only by knowing
    the query flag existed. It is now a peer surface of the story flow.
  -->
  <section class="space-y-3" aria-label="Quest overview">
    <QuestOverviewMetadata :quest="quest" />

    <LoadingSpinner v-if="beatsQuery.isLoading.value" class="mx-auto my-12" />
    <template v-else-if="overviewBeat">
      <section class="space-y-2 rounded-lg border border-border bg-card p-3" aria-label="Overview beat fields">
        <div>
          <h3 class="font-cinzel text-sm font-bold text-foreground">Story overview</h3>
          <p class="text-caption text-muted-foreground">The same narrative and player-visibility fields available on every beat.</p>
        </div>
        <QuestBeatFields :key="overviewBeat.id" :beat="overviewBeat" @preview="openPreview" />
      </section>
      <QuestBeatAttachmentsPanel :beat="overviewBeat" :attachments="overviewAttachments" />
      <QuestBeatLootPanel :beat="overviewBeat" :loot="overviewLoot" />
    </template>
    <div v-else role="alert" class="rounded-lg border border-dashed border-tone-caution/50 bg-tone-caution/5 p-3 text-caption text-tone-caution">
      The overview beat is not available yet. Apply the latest database migration to enable shared beat preparation here.
    </div>

    <QuestOverviewLifecycle :quest="quest" />

    <QuestPlayerPreviewDrawer
      v-if="previewOpen && overviewBeat"
      :quest-id="quest.id"
      :visible-to="quest.player_visible_to ?? []"
      :selected-beat-id="overviewBeat.id"
      :saved-visibility="previewContext?.savedVisibility"
      :draft-visibility="previewContext?.draftVisibility"
      @close="previewOpen = false"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useQuestBeatAttachmentSummaries, useQuestBeatLoot, useQuestBeats } from "@/composables/useQuestFlow";
import type { Quest, QuestBeat } from "@/types/quest.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import QuestBeatAttachmentsPanel from "./QuestBeatAttachmentsPanel.vue";
import QuestBeatFields from "./QuestBeatFields.vue";
import QuestBeatLootPanel from "./QuestBeatLootPanel.vue";
import QuestPlayerPreviewDrawer from "./QuestPlayerPreviewDrawer.vue";
import QuestOverviewLifecycle from "./QuestOverviewLifecycle.vue";
import QuestOverviewMetadata from "./QuestOverviewMetadata.vue";

const props = defineProps<{ quest: Quest }>();
const questId = computed(() => props.quest.id);
const beatsQuery = useQuestBeats(questId);
const attachmentsQuery = useQuestBeatAttachmentSummaries(questId);
const lootQuery = useQuestBeatLoot(questId);
const overviewBeat = computed(() => (beatsQuery.data.value ?? []).find((beat) => beat.is_overview || beat.conversion_source_type === "legacy_overview") ?? null);
const overviewAttachments = computed(() => (attachmentsQuery.data.value ?? []).filter((row) => row.beat_id === overviewBeat.value?.id));
const overviewLoot = computed(() => (lootQuery.data.value ?? []).filter((row) => row.beat_id === overviewBeat.value?.id));
const previewOpen = ref(false);
const previewContext = ref<{ draftVisibility: QuestBeat["visibility"]; savedVisibility: QuestBeat["visibility"] } | null>(null);

function openPreview(context: { draftVisibility: QuestBeat["visibility"]; savedVisibility: QuestBeat["visibility"] }) {
  previewContext.value = context;
  previewOpen.value = true;
}
</script>
