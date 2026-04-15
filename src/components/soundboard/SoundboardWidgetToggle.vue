<template>
  <button
    class="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
    :class="store.widgetOpen ? 'text-gold-400 bg-gold-500/10' : ''"
    title="Toggle soundboard"
    @click="store.toggleWidget()"
  >
    <Music2 class="h-3.5 w-3.5 shrink-0" />
    <span class="font-fell">Soundboard</span>
    <span
      v-if="totalPlaying > 0"
      class="ml-auto flex items-center justify-center h-4 w-4 rounded-full bg-gold-500/20 border border-gold-500/40 text-gold-300 text-[9px] font-cinzel"
    >
      {{ totalPlaying }}
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Music2 } from "lucide-vue-next";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSpotifyStore } from "@/stores/spotify";

const store = useSoundboardStore();
const spotifyStore = useSpotifyStore();

// Count HTML audio sounds + 1 if Spotify is actively playing
const totalPlaying = computed(
  () => store.playingCount + (spotifyStore.isConnected && spotifyStore.isPlaying ? 1 : 0),
);
</script>
