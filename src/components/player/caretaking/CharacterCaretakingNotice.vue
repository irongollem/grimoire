<template>
  <CaretakingNotice
    v-if="notice"
    :message="notice.message"
    :action-label="notice.actionLabel"
    :busy="ending"
    @action="end"
  />
</template>

<script setup lang="ts">
/**
 * The hand-over of one character, said once, wherever the player meets it: the
 * sheet and the Hearth (#1059). Renders nothing when the character is not handed
 * over, or not to or from the signed-in player.
 */
import CaretakingNotice from "@/components/player/caretaking/CaretakingNotice.vue";
import { useCaretaking } from "@/composables/party/useCaretaking";
import type { PartyMember } from "@/types/party.types";

const { member, viewedByDm = false } = defineProps<{ member: PartyMember; viewedByDm?: boolean }>();
const { notice, end, ending } = useCaretaking(() => member, () => viewedByDm);
</script>
