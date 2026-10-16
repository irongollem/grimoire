<template>
  <AppModal v-if="board" :open="open" size="full" :label="board.name" panel-class="h-[92dvh]" @close="dismiss">
    <ModalHeader :title="board.name" subtitle="Your DM has brought the party to the board." closeable @close="dismiss" />
    <div class="min-h-0 flex-1" data-presenter-board>
      <PlayerNoticeBoard :board="board" @navigated="dismiss" />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
/**
 * "Present now" (#1064): when the DM presents a board, it opens on every player's screen, like walking up to it
 * together. Closing it only dismisses that presentation, keyed on the board and its presented_at, so a second
 * presentation of the same board opens it again. Dismissals live in memory on purpose: a reload while the DM is still
 * presenting brings the board back, which is what being at the table means.
 *
 * Mounted in the player layout only, so the DM's own screens never open it. Not shown over the board's own page, which
 * already holds the same board.
 */
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import { usePresentedNoticeBoard } from "@/composables/noticeBoards/usePlayerNoticeBoards";
import PlayerNoticeBoard from "./PlayerNoticeBoard.vue";

const route = useRoute();
const board = usePresentedNoticeBoard();
const dismissed = ref(new Set<string>());

const presentationKey = computed(() => (board.value ? `${board.value.id}@${board.value.presented_at}` : null));
const open = computed(() => {
  const key = presentationKey.value;
  if (!key || dismissed.value.has(key)) return false;
  return !(route.name === "play-notice-board" && route.params.id === board.value?.id);
});

function dismiss() {
  if (presentationKey.value) dismissed.value = new Set(dismissed.value).add(presentationKey.value);
}
</script>
