<template>
  <!-- A pad, like the deck's: the whole tile is the button, so it stays a raw <button> as DeckPad does. -->
  <div class="flex flex-col items-center gap-2">
    <button
      type="button"
      class="song-tile relative aspect-square w-full overflow-hidden rounded-[1.75rem] transition-transform duration-150 active:scale-95 motion-reduce:transition-none focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white"
      :class="current ? 'ring-[6px] ring-white shadow-[0_0_32px_rgba(255,255,255,0.35)]' : 'shadow-[0_6px_0_rgba(0,0,0,0.35)]'"
      :aria-label="ariaLabel"
      :aria-pressed="current && playing"
      @click="emit('tap')"
    >
      <SongCover :song="song" class="absolute inset-0" />

      <!-- What a tap will do next, drawn rather than written: the child cannot read. -->
      <span
        v-if="current"
        class="absolute inset-0 flex items-center justify-center bg-black/25"
        aria-hidden="true"
      >
        <span class="flex h-[38%] w-[38%] items-center justify-center rounded-full bg-white/90 text-black shadow-lg">
          <IconPause v-if="playing" class="h-1/2 w-1/2" fill="currentColor" :stroke-width="0" />
          <IconPlay v-else class="h-1/2 w-1/2 translate-x-[6%]" fill="currentColor" :stroke-width="0" />
        </span>
      </span>
      <span
        v-if="current"
        class="absolute inset-x-0 bottom-0 h-2.5 bg-black/30"
        aria-hidden="true"
      >
        <span class="block h-full bg-white" :style="{ width: `${Math.round(progress * 1000) / 10}%` }" />
      </span>
      <span
        v-if="failed"
        class="absolute inset-0 flex items-center justify-center bg-black/55"
        aria-hidden="true"
      >
        <IconMute class="h-1/3 w-1/3 text-white" />
      </span>
    </button>
    <!-- For a grown-up, or a child learning to read: small, under the picture, never the way to find a song. -->
    <span class="line-clamp-2 text-center text-label text-white/80 text-balance">{{ song.name }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconMute, IconPause, IconPlay } from "@/lib/icons";
import type { Song } from "@/lib/songs/songShelf";
import SongCover from "./SongCover.vue";

const { song, current, playing, progress, failed } = defineProps<{
  song: Song;
  current: boolean;
  playing: boolean;
  progress: number;
  failed: boolean;
}>();

const emit = defineEmits<{ tap: [] }>();

const ariaLabel = computed(() => {
  if (current && playing) return `Pause ${song.name}`;
  return `Play ${song.name}`;
});
</script>
