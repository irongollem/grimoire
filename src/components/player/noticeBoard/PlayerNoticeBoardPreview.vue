<template>
  <RouterLink
    :to="{ name: 'play-notice-board', params: { id: board.id } }"
    class="group block overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-sm focus-visible:outline-2 focus-visible:outline-primary"
    :data-testid="`notice-board-${board.id}`"
  >
    <!-- A live miniature: the same surface and pins as the board, a card-width wide. Inert, so the link takes the tap. -->
    <div class="pointer-events-none" aria-hidden="true">
      <NoticeBoardSurface :surface="board.surface" :scatter="board.scatter">
        <NoticeBoardPin v-for="pin in pins" :key="pin.id" :face="pin" :editable="false" :selected="false" />
      </NoticeBoardSurface>
    </div>
    <div class="flex items-center gap-2 px-3 py-2">
      <p class="min-w-0 flex-1 truncate text-heading-xs font-semibold text-foreground">{{ board.name }}</p>
      <NoticeBoardStateChip v-if="board.presented_at !== null" state="presenting" label="Presenting now" />
      <EntityNewDot :is-new="isNew" title="New" />
    </div>
  </RouterLink>
</template>

<script setup lang="ts">
/** A board as a card: the journal's list and a place's panel both show it this way. */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import EntityNewDot from "@/components/common/entity/EntityNewDot.vue";
import NoticeBoardPin from "@/components/noticeBoard/NoticeBoardPin.vue";
import NoticeBoardStateChip from "@/components/noticeBoard/NoticeBoardStateChip.vue";
import NoticeBoardSurface from "@/components/noticeBoard/NoticeBoardSurface.vue";
import { inReadingOrder } from "@/lib/noticeBoard/readingOrder";
import type { PlayerNoticeBoard } from "@/types/noticeBoard.types";

const { board, isNew = false } = defineProps<{ board: PlayerNoticeBoard; isNew?: boolean }>();
const pins = computed(() => inReadingOrder(board.pins));
</script>
