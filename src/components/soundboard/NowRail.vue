<template>
  <div
    class="flex min-h-13 items-stretch gap-2 border-b border-gold-500/25 bg-card px-3 py-2"
  >
    <span
      class="shrink-0 self-stretch text-eyebrow font-bold text-gold-500 [writing-mode:vertical-rl] rotate-180"
    >
      NOW
    </span>

    <p v-if="isIdle" class="self-center text-body italic text-muted-foreground">
      Nothing audible. The room is yours.
    </p>

    <!-- Music: one lane, because the slot is exclusive. -->
    <div
      v-if="music !== null"
      class="group/row relative flex min-w-0 flex-[1_1_18rem] items-center gap-2 overflow-hidden rounded-md border border-gold-400/45 bg-gold-400/12 py-1.5 pe-2 ps-3"
    >
      <span class="absolute inset-y-0 inset-s-0 w-0.75 bg-gold-400" />
      <EqBars accent="music" :bars="5" />
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-1.5">
          <span class="truncate text-heading-xs font-semibold">{{ music.name }}</span>
          <CausedByChip :trigger="music.trigger" small />
        </div>
        <p class="truncate text-caption text-foreground/70">
          ♪ {{ music.trackName }}
          <span class="tabular-nums opacity-60">{{ music.position }}/{{ music.trackCount }}</span>
        </p>
      </div>
      <AppButton variant="ghost" size="inline-xs" class="shrink-0" :icon="IconSkipBack" tooltip="Previous track" @click="music.prev()" />
      <AppButton variant="ghost" size="inline-xs" class="shrink-0" :icon="IconSkipForward" tooltip="Next track" @click="music.next()" />
      <AppButton variant="ghost" size="inline-xs" class="shrink-0" :icon="IconStop" tooltip="Stop the music slot" @click="music.stop()" />
    </div>

    <!-- Scenes and loose sounds: a second lane that scrolls, because they
         stack. Loose sounds matter as much as the slots — a bed fired straight
         from the grid is exactly as audible as one a scene started, and a rail
         that says "nothing audible" over it is lying. -->
    <div
      v-if="scenes.length > 0 || looseSounds.length > 0"
      class="flex min-w-0 flex-[2_1_20rem] gap-1.5 overflow-x-auto"
    >
      <div
        v-for="scene in scenes"
        :key="scene.playlistId"
        class="group/row relative flex min-w-36 flex-[1_1_10rem] items-center gap-1.5 overflow-hidden rounded-md border border-tone-success/40 bg-tone-success/10 py-1.5 pe-2 ps-3"
      >
        <span class="absolute inset-y-0 inset-s-0 w-0.75 bg-tone-success" />
        <IconWind class="h-3.5 w-3.5 shrink-0 text-ink-success" />
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 items-center gap-1">
            <span class="truncate text-heading-xs font-semibold">{{ scene.name }}</span>
            <CausedByChip :trigger="scene.trigger" small />
          </div>
          <p class="text-caption text-foreground/70">
            {{ scene.layers }} {{ scene.layers === 1 ? "layer" : "layers" }}
          </p>
        </div>
        <!-- Scoped by id: pulling the rain must not close the tavern. -->
        <AppButton
          variant="ghost" size="inline-xs" class="shrink-0"
          :icon="IconStop"
          :tooltip="`Stop ${scene.name}`"
          @click="scene.stop()"
        />
      </div>

      <!-- Sounds fired straight from the grid, outside any slot. -->
      <div
        v-for="loose in looseSounds"
        :key="loose.id"
        class="group/row relative flex min-w-32 flex-[1_1_9rem] items-center gap-1.5 overflow-hidden rounded-md border py-1.5 pe-2 ps-3"
        :class="[CATEGORY_LANE_BORDER[loose.category], CATEGORY_LANE_TINT[loose.category]]"
      >
        <span class="absolute inset-y-0 inset-s-0 w-0.75" :class="CATEGORY_SPINE[loose.category]" />
        <EqBars :accent="loose.category" class="shrink-0" />
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 items-center gap-1">
            <span class="truncate text-heading-xs font-semibold">{{ loose.name }}</span>
            <CausedByChip :trigger="loose.trigger" small />
          </div>
        </div>
        <AppButton
          variant="ghost" size="inline-xs" class="shrink-0"
          :icon="IconStop"
          :tooltip="`Stop ${loose.name}`"
          @click="loose.stop()"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconSkipBack, IconSkipForward, IconStop, IconWind } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useNowPlaying } from "@/composables/soundboard/useNowPlaying";
import { CATEGORY_SPINE } from "@/lib/audio/soundCategories";
import CausedByChip from "./CausedByChip.vue";
import EqBars from "./EqBars.vue";
import type { SoundCategory } from "@/types/sound.types";

/**
 * What is audible, and why, before anything else on the page. The derivation
 * lives in `useNowPlaying`, shared with the deck's Now chips.
 */

const { music, scenes, loose: looseSounds, isIdle } = useNowPlaying();

/** Lane colouring per category, written out for Tailwind's scanner. */
const CATEGORY_LANE_BORDER: Record<SoundCategory, string> = {
  music: "border-gold-400/45",
  ambient: "border-tone-success/40",
  effects: "border-tone-info/40",
};
const CATEGORY_LANE_TINT: Record<SoundCategory, string> = {
  music: "bg-gold-400/12",
  ambient: "bg-tone-success/10",
  effects: "bg-tone-info/10",
};
</script>
