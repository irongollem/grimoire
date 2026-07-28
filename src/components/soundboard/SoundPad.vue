<template>
  <button
    type="button"
    class="group/pad relative flex w-full flex-col overflow-hidden rounded-md border text-left transition-colors"
    :class="[
      SIZE_CLASS[size],
      isPlaying
        ? `${CATEGORY_BORDER[sound.category]} ${CATEGORY_TINT[sound.category]}`
        : 'border-border bg-card hover:border-border/80',
      blockedReason === null ? '' : 'opacity-60',
    ]"
    :title="blockedReason ?? undefined"
    @click="toggle"
  >
    <!-- The spine is what makes the category readable across a table without
         reading a word of it. Thicker while audible. -->
    <span
      class="absolute inset-y-0 left-0"
      :class="[CATEGORY_SPINE[sound.category], isPlaying ? 'w-1' : 'w-0.75 opacity-75']"
    />

    <span class="flex min-w-0 items-start gap-1.5">
      <component
        :is="CATEGORY_ICON[sound.category]"
        class="mt-px shrink-0"
        :class="[iconSize, CATEGORY_TEXT[sound.category]]"
      />
      <span
        class="min-w-0 flex-1 font-cinzel font-semibold leading-tight line-clamp-2"
        :class="nameSize"
      >
        {{ sound.name }}
      </span>
      <slot name="key" />
    </span>

    <!--
      The small pad is deliberately not a shrunken medium one. At this density
      the DM is firing by position and colour, so everything that is not "is it
      playing" comes off — a row of unreadable 8px metadata is worse than none.
    -->
    <span v-if="size !== 'sm'" class="mt-auto flex min-w-0 items-center gap-1.5 pt-1">
      <EqBars v-if="isPlaying" :accent="sound.category" />
      <IconRepeat
        v-if="isLooping"
        class="h-2.5 w-2.5 shrink-0"
        :class="isPlaying ? CATEGORY_TEXT[sound.category] : 'text-muted-foreground'"
      />
      <span v-if="durationLabel" class="shrink-0 text-2xs tabular-nums text-muted-foreground">
        {{ durationLabel }}
      </span>
      <span v-if="size === 'lg' && sound.artist" class="min-w-0 truncate text-2xs text-muted-foreground/75">
        {{ sound.artist }}
      </span>
      <span class="flex-1" />
      <CausedByChip :trigger="trigger" small :releasable="false" />
    </span>

    <!-- Small pads still show that something is audible, just nothing else. -->
    <span v-else-if="isPlaying" class="mt-auto pt-1">
      <EqBars :accent="sound.category" />
    </span>

    <span v-if="blockedReason !== null" class="mt-1 text-2xs leading-snug text-destructive">
      {{ blockedReason }}
    </span>

    <!-- Progress along the bottom edge: position without spending a row on it. -->
    <span
      v-if="isPlaying && progress > 0"
      class="absolute inset-x-0 bottom-0 h-0.5 bg-black/35"
    >
      <span class="block h-full" :class="CATEGORY_SPINE[sound.category]" :style="{ width: `${progress * 100}%` }" />
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconRepeat, IconMusicNote, IconMusic, IconWind, IconLightning } from "@/lib/icons";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSoundPlayback } from "@/composables/useSoundPlayback";
import {
  CATEGORY_BORDER,
  CATEGORY_SPINE,
  CATEGORY_TEXT,
  CATEGORY_TINT,
} from "@/lib/soundCategories";
import { useActiveAudioTriggers } from "@/composables/useAudioThemeTriggers";
import CausedByChip from "./CausedByChip.vue";
import EqBars from "./EqBars.vue";
import type { Sound, SoundCategory, PadSize } from "@/types/sound.types";

/**
 * The fire target.
 *
 * The pad *is* the transport — tapping it plays or stops. That is the one
 * structural move in the redesign: play/stop came out of a button row and
 * became the whole card, because at the table a DM is aiming at a sound, not
 * at a control.
 */

const CATEGORY_ICON: Record<SoundCategory, typeof IconMusic> = {
  music: IconMusicNote,
  ambient: IconWind,
  effects: IconLightning,
  // Misc has no icon of its own anywhere else either; the palette falls through
  // to the generic music glyph, so this matches rather than inventing one.
  misc: IconMusic,
};

const SIZE_CLASS: Record<PadSize, string> = {
  sm: "min-h-14 gap-0.5 px-2 py-1.5 pl-3",
  md: "min-h-25 gap-1 px-2.5 py-2 pl-3.5",
  lg: "min-h-30 gap-1 px-3 py-2.5 pl-4",
};

const { sound, size = "md" } = defineProps<{
  sound: Sound;
  size?: PadSize;
}>();

const store = useSoundboardStore();
const { isPlaying, blockedReason, toggle } = useSoundPlayback(() => sound);
const { triggerForSound } = useActiveAudioTriggers();

const trigger = computed(() => triggerForSound(sound.id));
const state = computed(() => store.getState(sound.id));
const isLooping = computed(() => state.value.isLooping);

const progress = computed(() => {
  const { currentTime, duration } = state.value;
  if (duration <= 0) return 0;
  return Math.min(1, currentTime / duration);
});

const iconSize = computed(() => (size === "sm" ? "h-3 w-3" : size === "lg" ? "h-4 w-4" : "h-3.5 w-3.5"));
const nameSize = computed(() => (size === "sm" ? "text-xs" : size === "lg" ? "text-body" : "text-body-sm"));

const durationLabel = computed(() => {
  const seconds = state.value.duration;
  // 0 means "not loaded yet" rather than a zero-length file, so it shows
  // nothing instead of a confident "0.0s".
  if (!isFinite(seconds) || seconds <= 0) return null;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
});
</script>
