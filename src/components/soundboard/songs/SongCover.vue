<template>
  <!-- A song's face: its cover art, or a picture on its colour when it has none. Sized by the parent. -->
  <!-- No position class of its own: the parent places it (absolute in a pad, relative in the bar). -->
  <span class="block overflow-hidden" :style="{ backgroundColor: colour }">
    <img
      v-if="song.coverUrl && !artFailed"
      :src="song.coverUrl"
      alt=""
      loading="lazy"
      decoding="async"
      class="absolute inset-0 h-full w-full object-cover"
      draggable="false"
      @error="artFailed = true"
    />
    <component
      :is="picture"
      v-else
      class="absolute inset-0 m-auto h-[58%] w-[58%] text-white drop-shadow-[0_3px_0_rgba(0,0,0,0.25)]"
      :stroke-width="1.75"
      aria-hidden="true"
    />
  </span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { SONG_PICTURES } from "@/lib/icons";
import { SONG_COLOURS, type Song } from "@/lib/songs/songShelf";

const { song } = defineProps<{ song: Song }>();

const artFailed = ref(false);
watch(() => song.coverUrl, () => (artFailed.value = false));

const picture = computed(() => SONG_PICTURES[song.picture % SONG_PICTURES.length]);
const colour = computed(() => SONG_COLOURS[song.colour % SONG_COLOURS.length]);
</script>
