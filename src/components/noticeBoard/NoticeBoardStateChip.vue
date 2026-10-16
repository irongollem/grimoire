<template>
  <AppButton
    as="span"
    variant="tinted"
    size="xs"
    :tone="state === 'presenting' ? 'primary' : 'success'"
    :label="label ?? NOTICE_BOARD_STATE_LABELS[state]"
    class="shrink-0"
    :data-board-state="state"
  />
</template>

<script setup lang="ts">
/**
 * "Shown to players" and "Presenting" as one pill, for the DM's list card and the player's board alike. A static tag
 * (a span), not a control. `label` lets the player's side say "Presenting now", the DM's own board says what it is doing.
 */
import AppButton from "@/components/common/controls/AppButton.vue";
import { NOTICE_BOARD_STATE_LABELS, type NoticeBoardState } from "@/lib/noticeBoard/state";

defineProps<{ state: NoticeBoardState; label?: string }>();
</script>
