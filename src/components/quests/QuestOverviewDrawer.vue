<template>
  <Teleport to="body">
    <Transition name="quest-overview">
      <div
        class="fixed inset-0 z-50 flex justify-end"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quest-overview-heading"
      >
        <button
          type="button"
          class="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
          aria-label="Close quest overview"
          @click="emit('close')"
        />
        <aside
          ref="panel"
          tabindex="-1"
          class="quest-overview-panel relative flex h-full w-full flex-col border-l border-border bg-background shadow-2xl sm:max-w-2xl"
        >
          <header class="flex shrink-0 items-start gap-3 border-b border-border bg-card px-4 py-4 sm:px-6">
            <div class="min-w-0 flex-1">
              <p class="text-label font-bold uppercase tracking-widest text-primary">Overview inspector · quest-level beat</p>
              <h2 id="quest-overview-heading" class="truncate font-cinzel text-xl font-bold text-foreground">
                {{ quest.title || "Untitled Quest" }} — Overview
              </h2>
              <p class="mt-1 text-caption text-muted-foreground">
                Prepared like a beat, with extra context that spans the whole story.
              </p>
            </div>
            <AppButton label="Close" size="sm" variant="subtle" @click="emit('close')" />
          </header>
          <main class="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
            <LoadingSpinner v-if="beatsQuery.isLoading.value" class="mx-auto my-12" />
            <template v-else-if="overviewBeat">
              <section class="space-y-2 rounded-lg border border-border bg-card p-3" aria-label="Overview beat fields">
                <div>
                  <h3 class="font-cinzel text-sm font-bold text-foreground">Story overview</h3>
                  <p class="text-caption text-muted-foreground">The same narrative and player-visibility fields available on every beat.</p>
                </div>
                <QuestBeatFields :key="overviewBeat.id" :beat="overviewBeat" compact @preview="openPreview" />
              </section>
              <QuestBeatAttachmentsPanel :beat="overviewBeat" :attachments="overviewAttachments" />
              <QuestBeatLootPanel :beat="overviewBeat" :loot="overviewLoot" />
            </template>
            <div v-else role="alert" class="rounded-lg border border-dashed border-tone-caution/50 bg-tone-caution/5 p-3 text-caption text-tone-caution">
              The overview beat is not available yet. Apply the latest database migration to enable shared beat preparation here.
            </div>
            <QuestSheet :quest="quest" embedded beat-plus />
          </main>
        </aside>
        <QuestPlayerPreviewDrawer
          v-if="previewOpen && overviewBeat"
          :quest-id="quest.id"
          :visible-to="quest.player_visible_to ?? []"
          :selected-beat-id="overviewBeat.id"
          :saved-visibility="previewContext?.savedVisibility"
          :draft-visibility="previewContext?.draftVisibility"
          @close="previewOpen = false"
        />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { useQuestBeatAttachmentSummaries, useQuestBeatLoot, useQuestBeats } from "@/composables/useQuestFlow";
import type { Quest, QuestBeat } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import QuestBeatAttachmentsPanel from "./QuestBeatAttachmentsPanel.vue";
import QuestBeatFields from "./QuestBeatFields.vue";
import QuestBeatLootPanel from "./QuestBeatLootPanel.vue";
import QuestPlayerPreviewDrawer from "./QuestPlayerPreviewDrawer.vue";
import QuestSheet from "./QuestSheet.vue";

const props = defineProps<{ quest: Quest }>();
const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement | null>(null);
const returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") emit("close");
}

onMounted(async () => {
  window.addEventListener("keydown", onKeydown);
  await nextTick();
  panel.value?.focus();
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  returnFocusTo?.focus();
});
</script>

<style scoped>
.quest-overview-enter-active,
.quest-overview-leave-active {
  transition: opacity 180ms ease;
}
.quest-overview-enter-active .quest-overview-panel,
.quest-overview-leave-active .quest-overview-panel {
  transition: transform 220ms ease;
}
.quest-overview-enter-from,
.quest-overview-leave-to {
  opacity: 0;
}
.quest-overview-enter-from .quest-overview-panel,
.quest-overview-leave-to .quest-overview-panel {
  transform: translateX(100%);
}
</style>
