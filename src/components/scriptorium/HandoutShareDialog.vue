<template>
  <AppModal :open="open" size="lg" panel-class="sm:max-h-[85vh]" @close="emit('close')">
    <ModalHeader
      title="Give to players"
      :subtitle="handout.title"
      :icon="IconShare"
      tone="primary"
      closeable
      @close="emit('close')"
    />

    <div class="shrink-0 px-5 pt-4">
      <SegmentedControl v-model="how" :options="HOW_OPTIONS" size="md" aria-label="How" />
    </div>

    <!-- Each half is mounted fresh on open and on switch, so a half-made choice never leaks across. -->
    <HandoutHandOver
      v-if="how === 'hand'"
      :handout="handout"
      :initial-recipients="initialRecipients"
      @close="emit('close')"
    />
    <HandoutPinUp v-else :handout="handout" @close="emit('close')" />
  </AppModal>
</template>

<script setup lang="ts">
/**
 * The one way to give a Scriptorium handout to players (#970, reshaped by
 * #1115): a switch between handing it to party members and pinning it on a
 * notice board. Used by the editor's "Give to players" button, the audience
 * line's Reveal link and the quest cockpit.
 */
import { ref, watch } from "vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import HandoutHandOver from "@/components/scriptorium/HandoutHandOver.vue";
import HandoutPinUp from "@/components/scriptorium/HandoutPinUp.vue";
import type { ShareableHandout } from "@/composables/scriptorium/useHandoutShare";
import { IconShare } from "@/lib/icons";

const { open, handout, initialRecipients = null } = defineProps<{
  open: boolean;
  handout: ShareableHandout;
  /** Who the ticks start on while nobody has the handout yet (the quest cockpit starts on the whole party). */
  initialRecipients?: string[] | null;
}>();

const emit = defineEmits<{ close: [] }>();

type How = "hand" | "pin";
const HOW_OPTIONS: SegmentedOption<How>[] = [
  { value: "hand", label: "Hand it over" },
  { value: "pin", label: "Pin it on a board" },
];

const how = ref<How>("hand");
// Always opens on handing it over: the dialog is reused for the next handout.
watch(
  () => open,
  (isOpen) => {
    if (isOpen) how.value = "hand";
  },
);
</script>
