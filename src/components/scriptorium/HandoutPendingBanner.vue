<template>
  <CautionNotice v-if="pending > 0" class="flex flex-wrap items-center justify-between gap-2">
    <span>{{ describePending(pending) }}</span>
    <AppButton variant="link" size="sm" label="Reveal" @click="open = true" />
  </CautionNotice>
  <HandoutShareDialog :open="open" :handout="handout" :proposed="handout.player_visible_to" @close="open = false" />
</template>

<script setup lang="ts">
/**
 * "1 linked entry is hidden from players. Reveal": shown on a shared handout
 * whose linked entries would still reveal something (#970). Never reveals on
 * its own; the button opens the same confirmation as sharing does.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import CautionNotice from "@/components/common/feedback/CautionNotice.vue";
import HandoutShareDialog from "@/components/scriptorium/HandoutShareDialog.vue";
import { usePendingHandoutReveals, type ShareableHandout } from "@/composables/scriptorium/useHandoutShare";
import { describePending } from "@/lib/scriptorium/handoutShareSummary";

const { handout } = defineProps<{ handout: ShareableHandout }>();

const { pending } = usePendingHandoutReveals(computed(() => handout));
const open = ref(false);
</script>
