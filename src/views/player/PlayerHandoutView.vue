<template>
  <!-- Below md the route is fullscreenMobile, so PlayerLayout drops its own
       chrome and padding and the reader owns the phone screen; from md up it
       sits in the layout as a page-width column. -->
  <div v-if="isLoading && !shown" class="flex justify-center py-16">
    <LoadingSpinner />
  </div>
  <EmptyState
    v-else-if="!shown"
    title="Handout not available"
    description="Your DM may have taken it back, or it was never meant for you."
  >
    <template #icon><IconScrollText class="h-16 w-16" /></template>
    <template #action>
      <AppButton to="/play/journal?tab=handouts" variant="subtle" size="md" label="Back to Handouts" />
    </template>
  </EmptyState>
  <div v-else class="h-full md:mx-auto md:h-auto md:max-w-3xl md:overflow-hidden md:rounded-lg md:border md:border-border">
    <ScriptoriumReader
      :book="shown"
      :chapters="shown.chapters"
      :chapter="shown.chapter"
      :loading="isFetching"
      audience="player"
      back-to="/play/journal?tab=handouts"
      @select-chapter="chapterId = $event"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * One handout, read in the Scriptorium reader as a player sees it (#970).
 * Opening it marks it read; a DM edit while it is open changes `updated_at`,
 * which re-marks it, so the dot never lights for a page already on screen.
 * Withdrawn and never-shared both resolve to the same "not available" state.
 * A book reads one chapter at a time: the chapter asked for goes to
 * `get_player_handout`, which strips DM-only blocks and Deep halves server-side.
 */
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { IconScrollText } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import ScriptoriumReader from "@/components/scriptorium/ScriptoriumReader.vue";
import { usePlayerHandout } from "@/composables/scriptorium/usePlayerHandouts";
import type { PlayerHandout } from "@/types/scriptorium.types";
import { useMarkRead } from "@/composables/player/useReadItems";

const route = useRoute();
const id = computed(() => String(route.params.id));
// Which chapter to read: the server answers with the first until the reader asks for another.
const chapterId = ref<string | null>(null);
const { data: handout, isLoading, isFetching } = usePlayerHandout(id, chapterId);
const { mutate: markRead } = useMarkRead();

// Turning to another chapter is a new read with its own key, so `data` is empty for a moment. Keeping the
// last answer on screen keeps the reader (and where it is in the book) mounted; only a handout the server
// says is gone (null) clears it.
const shown = ref<PlayerHandout | null>(null);
// A different handout starts over, from its first chapter.
watch(id, () => {
  chapterId.value = null;
  shown.value = null;
});
watch(
  handout,
  (answer) => {
    if (answer !== undefined) shown.value = answer;
  },
  { immediate: true },
);

watch(
  () => [shown.value?.id, shown.value?.updated_at] as const,
  ([docId]) => {
    if (docId) markRead({ entityType: "handout", entityId: docId });
  },
  { immediate: true },
);
</script>
