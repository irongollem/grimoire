<template>
  <ListSkeleton v-if="isLoading" variant="stack" />
  <div v-else-if="!boards.length" class="text-center py-12">
    <IconScrollText class="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
    <p class="font-fell text-muted-foreground italic">No notice boards yet. When your DM puts one up, it will appear here.</p>
  </div>
  <div v-else class="grid grid-cols-1 gap-3 md:grid-cols-2">
    <PlayerNoticeBoardPreview v-for="b in boards" :key="b.id" :board="b" :is-new="isNew(b.id, b.updated_at)" />
  </div>
</template>

<script setup lang="ts">
/**
 * The Notice Boards tab (#1064): boards the DM has put up, each a live miniature that opens the board at
 * /play/notice-boards/:id. A board is a handful per campaign, so this is a plain grid, not a windowed list.
 */
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import PlayerNoticeBoardPreview from "@/components/player/noticeBoard/PlayerNoticeBoardPreview.vue";
import { IconScrollText } from "@/lib/icons";
import type { PlayerNoticeBoard } from "@/types/noticeBoard.types";

defineProps<{
  isLoading: boolean;
  boards: PlayerNoticeBoard[];
  isNew: (id: string, updatedAt: string) => boolean;
}>();
</script>
