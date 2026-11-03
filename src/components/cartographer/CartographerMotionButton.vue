<template>
  <AppButton
    v-if="available"
    variant="subtle"
    size="caption"
    :icon="playing ? IconPause : IconPlay"
    :aria-pressed="playing"
    :disabled="reduced"
    :title="reduced ? 'Your device asks for less motion' : undefined"
    @click="emit('toggle')"
  >
    Motion
  </AppButton>
</template>

<script setup lang="ts">
// The Motion button in the map's corner (#1125 frame 17): pauses flowing water, swaying trees and firelight while
// the DM edits, and plays them again. Shown only when the drawing has anything that moves.
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconPause, IconPlay } from "@/lib/icons";

const { available, playing, reduced = false } = defineProps<{
  /** The drawing has water, sway or a moving light (`mapHasMotion`). */
  available: boolean;
  /** Whether motion is playing now (the store's `motionRunning`). */
  playing: boolean;
  /** The OS asks for reduced motion: the button stays, but cannot start it. */
  reduced?: boolean;
}>();

const emit = defineEmits<{ toggle: [] }>();
</script>
