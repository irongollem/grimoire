<template>
  <!-- Below md the route is fullscreenMobile, so PlayerLayout drops its own
       chrome and padding and the reader owns the phone screen; from md up it
       sits in the layout as a page-width column. -->
  <div v-if="isLoading" class="flex justify-center py-16">
    <LoadingSpinner />
  </div>
  <EmptyState
    v-else-if="!handout"
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
      :document="handout"
      audience="player"
      back-to="/play/journal?tab=handouts"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * One handout, read in the Scriptorium reader as a player sees it (#970).
 * Opening it marks it read; a DM edit while it is open changes `updated_at`,
 * which re-marks it, so the dot never lights for a page already on screen.
 * Withdrawn and never-shared both resolve to the same "not available" state.
 */
import { computed, watch } from "vue";
import { useRoute } from "vue-router";
import { IconScrollText } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import ScriptoriumReader from "@/components/scriptorium/ScriptoriumReader.vue";
import { usePlayerHandout } from "@/composables/scriptorium/usePlayerHandouts";
import { useMarkRead } from "@/composables/player/useReadItems";

const route = useRoute();
const id = computed(() => String(route.params.id));
const { data: handout, isLoading } = usePlayerHandout(id);
const { mutate: markRead } = useMarkRead();

watch(
  () => [handout.value?.id, handout.value?.updated_at] as const,
  ([docId]) => {
    if (docId) markRead({ entityType: "handout", entityId: docId });
  },
  { immediate: true },
);
</script>
