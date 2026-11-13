<template>
  <div class="flex items-center gap-2">
    <template v-if="partyHere">
      <AppButton :icon="IconUndo" label="Undo" :size="size" variant="subtle" :class="touch" :disabled="busy" @click="emit('undo')" />
      <AppButton :icon-right="IconChevronRight" label="Advance" :size="size" variant="primary" :class="touch" :disabled="!canAdvance || busy" @click="emit('advance')" />
    </template>
    <AppButton v-else label="Put the party here" :size="size" variant="primary" :class="touch" :loading="busy" @click="emit('put-here')" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconChevronRight, IconUndo } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";

/**
 * The opened beat's two moves (#1183, frame 04): Undo and Advance when the
 * party stands here, "Put the party here" when it does not. One component for
 * the header row and the phone's bottom bar, so the two cannot disagree about
 * which move a beat offers.
 */
const { partyHere, canAdvance, busy = false, size = "sm" } = defineProps<{
  partyHere: boolean;
  canAdvance: boolean;
  busy?: boolean;
  size?: "sm" | "lg";
}>();
const emit = defineEmits<{ undo: []; advance: []; "put-here": [] }>();

/** The phone bar's targets are 44px and up. */
const touch = computed(() => (size === "lg" ? "min-h-12 flex-1" : ""));
</script>
