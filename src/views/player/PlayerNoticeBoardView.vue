<template>
  <div v-if="isLoading" class="flex justify-center py-16">
    <LoadingSpinner />
  </div>
  <EmptyState v-else-if="!board" title="Notice board not available" description="Your DM may have taken it down, or it was never put up for you.">
    <template #icon><IconScrollText class="h-16 w-16" /></template>
    <template #action>
      <AppButton to="/play/journal?tab=notice-boards" variant="subtle" size="md" label="Back to Notice Boards" />
    </template>
  </EmptyState>
  <!-- Below md the route is fullscreenMobile and owns the phone screen; from md up it sits in the layout at a fixed height. -->
  <div v-else class="flex h-full flex-col bg-card md:h-[78dvh] md:overflow-hidden md:rounded-lg md:border md:border-border">
    <header class="flex shrink-0 items-center gap-2 border-b border-border px-2 py-2">
      <AppButton to="/play/journal?tab=notice-boards" variant="ghost" size="icon-sm" :icon="IconChevronLeft" aria-label="Back to Notice Boards" />
      <h1 class="min-w-0 flex-1 truncate text-heading-sm font-bold text-foreground">{{ board.name }}</h1>
      <NoticeBoardStateChip v-if="board.presented_at !== null" state="presenting" label="Presenting now" />
    </header>
    <div class="min-h-0 flex-1">
      <PlayerNoticeBoard :board="board" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * One notice board, full height (#1064). Opening it marks it read; a DM edit changes `updated_at` and re-marks it, so
 * the dot never lights for a board already on screen. A withdrawn and a never-revealed board both read as "not
 * available": the projection lists revealed boards only.
 */
import { computed, watch } from "vue";
import { useRoute } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import PlayerNoticeBoard from "@/components/player/noticeBoard/PlayerNoticeBoard.vue";
import NoticeBoardStateChip from "@/components/noticeBoard/NoticeBoardStateChip.vue";
import { usePlayerNoticeBoard, usePlayerNoticeBoards } from "@/composables/noticeBoards/usePlayerNoticeBoards";
import { useMarkRead } from "@/composables/player/useReadItems";
import { IconChevronLeft, IconScrollText } from "@/lib/icons";

const route = useRoute();
const id = computed(() => String(route.params.id));
const { isLoading } = usePlayerNoticeBoards();
const board = usePlayerNoticeBoard(id);
const { mutate: markRead } = useMarkRead();

watch(
  () => [board.value?.id, board.value?.updated_at] as const,
  ([boardId]) => {
    if (boardId) markRead({ entityType: "notice_board", entityId: boardId });
  },
  { immediate: true },
);
</script>
