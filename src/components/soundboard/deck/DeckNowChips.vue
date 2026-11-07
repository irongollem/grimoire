<template>
  <div class="flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Now playing" role="group">
    <span class="shrink-0 text-eyebrow font-bold text-primary">Now</span>

    <span v-if="isIdle" class="text-label text-muted-foreground italic">Nothing audible. The room is yours.</span>

    <span
      v-if="music !== null"
      class="inline-flex min-h-6.5 max-w-full items-center gap-1.5 rounded-sm border py-0.5 ps-2 pe-0.5 text-label font-semibold pointer-coarse:min-h-11"
      :class="CHIP.playlist"
      data-now="music"
    >
      <span class="truncate">{{ music.name }}</span>
      <span class="shrink-0 font-normal text-muted-foreground tabular-nums">{{ music.position }}/{{ music.trackCount }}</span>
      <CausedByChip :trigger="music.trigger" small />
      <AppButton variant="ghost" size="icon-2xs" class="pointer-coarse:size-9" :icon="IconSkipForward" :tooltip="`Next track (now: ${music.trackName})`" @click="music.next()" />
      <AppButton variant="ghost" size="icon-2xs" class="pointer-coarse:size-9" :icon="IconClose" :tooltip="`Stop ${music.name}`" @click="music.stop()" />
    </span>

    <span
      v-for="scene in scenes"
      :key="scene.playlistId"
      class="inline-flex min-h-6.5 max-w-full items-center gap-1.5 rounded-sm border py-0.5 ps-2 pe-0.5 text-label font-semibold pointer-coarse:min-h-11"
      :class="CHIP.scene"
      data-now="scene"
    >
      <span class="truncate">{{ scene.name }}</span>
      <CausedByChip :trigger="scene.trigger" small />
      <AppButton variant="ghost" size="icon-2xs" class="pointer-coarse:size-9" :icon="IconClose" :tooltip="`Stop ${scene.name}`" @click="scene.stop()" />
    </span>

    <span
      v-for="sound in looseSounds"
      :key="sound.id"
      class="inline-flex min-h-6.5 max-w-full items-center gap-1.5 rounded-sm border py-0.5 ps-2 pe-0.5 text-label font-semibold pointer-coarse:min-h-11"
      :class="CHIP[sound.category]"
      data-now="sound"
    >
      <span class="truncate">{{ sound.name }}</span>
      <CausedByChip :trigger="sound.trigger" small />
      <AppButton variant="ghost" size="icon-2xs" class="pointer-coarse:size-9" :icon="IconClose" :tooltip="`Stop ${sound.name}`" @click="sound.stop()" />
    </span>
  </div>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import CausedByChip from "@/components/soundboard/CausedByChip.vue";
import { IconClose, IconSkipForward } from "@/lib/icons";
import { useNowPlaying } from "@/composables/soundboard/useNowPlaying";
import type { PadHue } from "@/lib/audio/soundCategories";

/**
 * What is audible, as compact chips (#1136): a name, where it came from when a
 * trigger started it, a next-track button for the music playlist, and a stop.
 * The derivation is `useNowPlaying`, shared with the old Now rail so the two
 * cannot disagree. Chips take the pad colours so a chip and its pad match.
 */

const { music, scenes, loose: looseSounds, isIdle } = useNowPlaying();

// Written out in full for Tailwind's scanner.
const CHIP: Record<PadHue, string> = {
  music: "border-pad-music bg-pad-music/12",
  ambient: "border-pad-ambient bg-pad-ambient/12",
  effects: "border-pad-effects bg-pad-effects/12",
  playlist: "border-pad-playlist bg-pad-playlist/12",
  scene: "border-pad-scene bg-pad-scene/12",
};
</script>
