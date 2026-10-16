<template>
  <DungeonCraftEntityGrid
    :items="boards"
    :is-loading="boardsLoading"
    v-model:search="noticeBoardsSearch"
    :shown="filteredBoards"
    :item-key="boardKey"
    list-key="notice-boards"
    search-placeholder="Search notice boards…"
    no-match-text="No notice boards match your filter."
    empty-icon="Pin"
    empty-title="No notice boards yet"
    empty-description="A notice board is where you pin quests as notes, wanted posters and sealed letters, and your players take them down at the table."
    empty-action-label="New Notice Board"
    @empty-action="router.push('/notice-boards/new')"
  >
    <template #filters>
      <AppButton
        v-if="dungeonFeaturesUi.noticeBoardsHasActiveFilters"
        variant="subtle"
        size="body"
        label="Clear"
        @click="dungeonFeaturesUi.resetNoticeBoardsFilters()"
      />
    </template>
    <template #card="{ item: board }">
      <RouterLink
        :to="`/notice-boards/${board.id}`"
        class="flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-2 transition-colors hover:border-primary/50"
      >
        <!-- The board itself, small. Inert: the pins are buttons, and a link must not hold buttons. -->
        <div class="pointer-events-none overflow-hidden rounded-md" inert aria-hidden="true" data-board-preview>
          <NoticeBoardSurface :surface="board.surface">
            <NoticeBoardPin v-for="face in previewFaces(board.id)" :key="face.id" :face="face" />
          </NoticeBoardSurface>
        </div>
        <div class="flex items-start justify-between gap-2 px-1">
          <h3 class="text-heading-sm font-bold leading-tight text-foreground">{{ board.name }}</h3>
        </div>
        <div class="flex flex-wrap items-center gap-1.5 px-1 pb-1">
          <span class="text-caption-sm text-muted-foreground">{{ countLine(board.id) }}</span>
          <!-- Presenting implies revealed (a check constraint), so this one test covers both states. -->
          <NoticeBoardStateChip v-if="board.is_revealed" :state="board.presented_at ? 'presenting' : 'shown'" />
        </div>
      </RouterLink>
    </template>
    <template #row="{ item: board }">
      <EntityListRow
        :to="`/notice-boards/${board.id}`"
        :title="board.name"
        :subtitle="countLine(board.id)"
        :fallback-icon="IconNoticeBoard"
        :tags="stateTags(board)"
      />
    </template>
  </DungeonCraftEntityGrid>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { RouterLink, useRouter } from "vue-router";
import { useCampaignNoticeBoardPins, useNoticeBoards } from "@/composables/noticeBoards/useNoticeBoards";
import { useDungeonFeaturesUiStore } from "@/stores/ui/dungeonFeatures";
import { IconNoticeBoard } from "@/lib/icons";
import { toPinFace } from "@/lib/noticeBoard/faces";
import { NOTICE_BOARD_STATE_LABELS, noticeBoardState } from "@/lib/noticeBoard/state";
import type { NoticeBoard, NoticeBoardPin as PinRow } from "@/types/noticeBoard.types";
import AppButton from "@/components/common/controls/AppButton.vue";
import EntityListRow from "@/components/common/entity/EntityListRow.vue";
import NoticeBoardStateChip from "@/components/noticeBoard/NoticeBoardStateChip.vue";
import NoticeBoardPin from "@/components/noticeBoard/NoticeBoardPin.vue";
import NoticeBoardSurface from "@/components/noticeBoard/NoticeBoardSurface.vue";
import DungeonCraftEntityGrid from "./DungeonCraftEntityGrid.vue";

const router = useRouter();
const dungeonFeaturesUi = useDungeonFeaturesUiStore();
const { data: boards, isLoading: boardsLoading } = useNoticeBoards();
// One read of the campaign's pins feeds every card's preview, instead of a request per board.
const { data: allPins } = useCampaignNoticeBoardPins();
// Filter state lives in the UI store so it survives opening a board and coming back.
const { noticeBoardsSearch } = storeToRefs(dungeonFeaturesUi);

const boardKey = (board: NoticeBoard) => board.id;

const filteredBoards = computed(() => {
  const list = boards.value ?? [];
  const q = noticeBoardsSearch.value.toLowerCase().trim();
  return q ? list.filter((b) => b.name.toLowerCase().includes(q)) : list;
});

const pinsByBoard = computed(() => {
  const map = new Map<string, PinRow[]>();
  for (const pin of allPins.value ?? []) {
    const list = map.get(pin.board_id);
    if (list) list.push(pin);
    else map.set(pin.board_id, [pin]);
  }
  return map;
});

/** Drafts are off the board, so they are off its preview too. */
function previewFaces(boardId: string) {
  return (pinsByBoard.value.get(boardId) ?? []).filter((p) => p.status !== "draft").map((p) => toPinFace(p, null));
}

function countLine(boardId: string): string {
  const up = (pinsByBoard.value.get(boardId) ?? []).filter((p) => p.status === "up").length;
  return `${up} ${up === 1 ? "notice" : "notices"} up`;
}

function stateTags(board: NoticeBoard): string[] {
  const state = noticeBoardState(board);
  return state ? [NOTICE_BOARD_STATE_LABELS[state]] : [];
}
</script>
