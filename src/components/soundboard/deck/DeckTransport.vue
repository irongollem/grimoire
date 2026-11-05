<template>
  <div :class="compact ? 'flex flex-col gap-1.5' : 'flex flex-wrap items-center gap-1.5'" role="group" aria-label="Whole-deck controls">
    <!-- Compact is two short lines, the buttons over the fader, so the folded row keeps its width for pads. -->
    <div :class="compact ? 'flex items-center gap-1' : 'contents'">
      <AppButton
        variant="outline"
        :size="compact ? 'icon-sm' : 'sm'"
        :active="paused"
        :icon="paused ? IconPlay : IconPause"
        :label="paused ? 'Resume' : 'Pause all'"
        :tooltip="paused ? 'Resume everything' : 'Hold everything where it is'"
        :class="compact ? 'pointer-coarse:size-11' : 'pointer-coarse:min-h-11'"
        :aria-label="paused ? 'Resume' : 'Pause all'"
        @click="emit('pauseAll')"
      >
        <template v-if="compact" #default><span class="sr-only">{{ paused ? "Resume" : "Pause all" }}</span></template>
      </AppButton>

      <AppButton
        variant="outline"
        :size="compact ? 'icon-sm' : 'sm'"
        :active="hush"
        :icon="IconHush"
        label="Hush"
        tooltip="Everything drops to a murmur while you talk. Tap to lock, hold to hush only while held"
        :class="compact ? 'pointer-coarse:size-11' : 'pointer-coarse:min-h-11'"
        aria-label="Hush"
        :aria-pressed="hush"
        @pointerdown="hushGesture.begin()"
        @pointerup="hushGesture.end()"
        @pointercancel="hushGesture.end()"
        @pointerleave="hushGesture.end()"
        @contextmenu.prevent
        @click="hushGesture.onClick($event)"
      >
        <template v-if="compact" #default><span class="sr-only">Hush</span></template>
      </AppButton>

      <AppButton
        variant="outline"
        :size="compact ? 'icon-sm' : 'sm'"
        :icon="IconFade"
        label="Fade all"
        tooltip="Take every sound out over the board's fade time"
        :class="compact ? 'pointer-coarse:size-11' : 'pointer-coarse:min-h-11'"
        aria-label="Fade all"
        @click="emit('fadeAll')"
      >
        <template v-if="compact" #default><span class="sr-only">Fade all</span></template>
      </AppButton>

      <slot />
    </div>

    <VolumeSlider
      :class="compact ? '' : 'ms-1'"
      label="Master"
      :label-hidden="compact"
      :wide="compact"
      :model-value="masterVolume"
      @update:model-value="(value: number) => emit('master', value)"
    />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import VolumeSlider from "@/components/soundboard/VolumeSlider.vue";
import { IconFade, IconHush, IconPause, IconPlay } from "@/lib/icons";
import type { DeckPhase } from "@/lib/audio/deck/deckSurface";
import { createTapOrHold } from "./tapOrHold";

/**
 * Whole-deck controls (#1136). Hush is a button, not a tool, because it is
 * needed without thinking; it follows the same rule as a tool: tap to lock,
 * hold to borrow.
 */

const { paused, hush, masterVolume, compact = false } = defineProps<{
  paused: boolean;
  hush: boolean;
  masterVolume: number;
  /** Icon-only and two lines high, for the folded row. Its slot sits at the end of the buttons. */
  compact?: boolean;
}>();

const emit = defineEmits<{
  pauseAll: [];
  fadeAll: [];
  hush: [payload: { phase: DeckPhase }];
  master: [value: number];
}>();

const hushGesture = createTapOrHold((phase) => emit("hush", { phase }));
onBeforeUnmount(() => hushGesture.dispose());
</script>
