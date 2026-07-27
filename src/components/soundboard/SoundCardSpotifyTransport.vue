<template>
  <!-- ── Spotify: not this user's feature ─────────────────────────── -->
  <div
    v-if="!spotifyStore.isEnabled"
    class="flex items-center gap-1.5 py-1 px-2 rounded-md bg-border/30"
  >
    <IconMusicNote class="h-3 w-3 text-muted-foreground/50 shrink-0" />
    <p class="text-caption text-muted-foreground/60 italic">DM audio</p>
  </div>

  <!-- ── Spotify not-connected fallback ─────────────────────────────── -->
  <div
    v-else-if="!spotifyStore.isConnected"
    class="flex items-center gap-2 py-1 px-2 rounded-md bg-green-500/5 border border-green-500/20"
  >
    <IconMusicNote class="h-3.5 w-3.5 text-green-400/70 shrink-0" />
    <p class="text-caption text-muted-foreground italic flex-1">Connect Spotify to play</p>
    <button
      class="text-caption text-green-400 hover:text-green-300 transition-colors shrink-0"
      @click="spotifyStore.connect()"
    >
      Connect →
    </button>
  </div>

  <!-- ── Spotify ready: album art + track info ──────────────────────── -->
  <template v-else>
    <!-- Currently-playing track info (when this card is active) -->
    <div
      v-if="isActive && spotifyStore.trackName"
      class="flex items-center gap-2 min-w-0"
    >
      <img
        v-if="spotifyStore.albumArtUrl"
        :src="spotifyStore.albumArtUrl"
        class="h-8 w-8 rounded shrink-0 object-cover"
        alt=""
      />
      <div class="min-w-0">
        <p class="text-caption text-foreground truncate">{{ spotifyStore.trackName }}</p>
        <p class="text-caption-sm text-muted-foreground truncate">{{ spotifyStore.artistName }}</p>
      </div>
    </div>

    <!-- Spotify playback controls -->
    <div class="flex items-center gap-2">
      <!-- Previous (only when active) -->
      <button
        v-if="isActive"
        class="flex items-center justify-center w-5 h-5 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title="Previous track"
        @click="spotifyStore.previousTrack()"
      >
        <IconSkipBack class="h-3 w-3" />
      </button>

      <!-- IconPlay / IconPause -->
      <button
        class="flex items-center justify-center w-7 h-7 rounded-full border transition-colors shrink-0"
        :class="
          !spotifyStore.isReady
            ? 'border-border text-muted-foreground/30 cursor-not-allowed'
            : isActive && spotifyStore.isPlaying
            ? 'bg-green-500/20 border-green-500/50 text-green-300 hover:bg-green-500/30'
            : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'
        "
        :title="!spotifyStore.isReady ? 'Spotify connecting…' : isActive && spotifyStore.isPlaying ? 'IconPause' : 'IconPlay'"
        :disabled="!spotifyStore.isReady"
        @click="toggleSpotify"
      >
        <IconPause v-if="isActive && spotifyStore.isPlaying" class="h-3.5 w-3.5" />
        <IconPlay v-else class="h-3.5 w-3.5 translate-x-px" />
      </button>

      <!-- Next (only when active) -->
      <button
        v-if="isActive"
        class="flex items-center justify-center w-5 h-5 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title="Next track"
        @click="spotifyStore.nextTrack()"
      >
        <IconSkipForward class="h-3 w-3" />
      </button>

      <!-- Volume -->
      <VolumeSlider
        class="flex-1"
        wide
        show-percent
        accent="green"
        :model-value="spotifyStore.volume"
        @update:model-value="spotifyStore.setVolume($event)"
      />
    </div>

    <!-- Spotify progress bar (only when this card is active) -->
    <div v-if="isActive && spotifyStore.durationMs > 0" class="flex items-center gap-2">
      <span class="text-caption-sm text-muted-foreground tabular-nums shrink-0">
        {{ formatTime(spotifyStore.positionMs) }}
      </span>
      <div
        class="flex-1 relative h-1.5 bg-border/50 rounded-full cursor-pointer"
        @click="handleSpotifySeek"
      >
        <div
          class="absolute inset-y-0 left-0 bg-green-500/60 rounded-full"
          :style="{ width: spotifyProgressPercent + '%' }"
        />
      </div>
      <span class="text-caption-sm text-muted-foreground tabular-nums shrink-0">
        {{ formatTime(spotifyStore.durationMs) }}
      </span>
      <!-- IconRepeat -->
      <button
        class="shrink-0 p-0.5 rounded transition-all [@media(hover:hover)]:opacity-0 group-hover:opacity-100"
        :class="spotifyStore.repeatMode > 0 ? 'text-green-500' : 'text-muted-foreground hover:text-foreground'"
        :title="repeatTitle"
        @click="cycleRepeat"
      >
        <IconRepeatOne v-if="spotifyStore.repeatMode === 2" class="h-2.5 w-2.5" />
        <IconRepeat v-else class="h-2.5 w-2.5" />
      </button>
      <!-- IconShuffle -->
      <button
        class="shrink-0 p-0.5 rounded transition-all [@media(hover:hover)]:opacity-0 group-hover:opacity-100"
        :class="spotifyStore.shuffleOn ? 'text-green-500' : 'text-muted-foreground hover:text-foreground'"
        title="Shuffle"
        @click="spotifyStore.setShuffle(!spotifyStore.shuffleOn)"
      >
        <IconShuffle class="h-2.5 w-2.5" />
      </button>
    </div>

    <!-- Not-ready indicator -->
    <p
      v-if="!spotifyStore.isReady"
      class="text-caption-sm text-muted-foreground italic text-center"
    >
      Connecting to Spotify device…
    </p>
  </template>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconMusicNote, IconPause, IconPlay, IconRepeat, IconRepeatOne, IconShuffle, IconSkipBack, IconSkipForward } from '@/lib/icons';
import VolumeSlider from "./VolumeSlider.vue";
import { useSpotifyStore } from "@/stores/spotify";
import type { Sound } from "@/types/sound.types";

const { sound } = defineProps<{
  sound: Sound;
}>();

const spotifyStore = useSpotifyStore();

// This card is "active" when it's the one currently driving the Spotify player.
const isActive = computed(
  () => spotifyStore.lastPlayedUrl === sound.file_url && spotifyStore.isPlaying,
);

function toggleSpotify() {
  if (!spotifyStore.isReady) return;
  if (isActive.value) {
    spotifyStore.pause();
  } else {
    spotifyStore.play(sound.file_url);
  }
}

const spotifyProgressPercent = computed(() => {
  if (!spotifyStore.durationMs) return 0;
  return Math.min(100, (spotifyStore.positionMs / spotifyStore.durationMs) * 100);
});

function handleSpotifySeek(e: MouseEvent) {
  const bar = e.currentTarget as HTMLElement;
  spotifyStore.seek(Math.round((e.offsetX / bar.clientWidth) * spotifyStore.durationMs));
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const repeatTitle = computed(() => {
  if (spotifyStore.repeatMode === 2) return "IconRepeat: Track";
  if (spotifyStore.repeatMode === 1) return "IconRepeat: Context";
  return "IconRepeat: Off";
});

function cycleRepeat() {
  const next = ((spotifyStore.repeatMode + 1) % 3) as 0 | 1 | 2;
  spotifyStore.setRepeat(next);
}
</script>
