<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0 translate-y-2"
      leave-to-class="opacity-0 translate-y-2"
    >
      <div
        v-if="store.widgetOpen"
        class="fixed bottom-16 right-4 z-50 w-72 rounded-lg border border-border bg-card shadow-xl"
      >
        <!-- Header -->
        <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Music2 class="h-3.5 w-3.5 text-gold-400 shrink-0" />
          <span class="font-cinzel text-xs font-semibold text-foreground flex-1 tracking-wide">Soundboard</span>
          <button
            v-if="store.playingCount > 0 || spotifyStore.isPlaying"
            class="font-fell text-[10px] text-muted-foreground hover:text-destructive transition-colors px-1.5 py-0.5 rounded border border-border hover:border-destructive/40"
            title="Stop all sounds"
            @click="stopAll"
          >
            Stop All
          </button>
          <button
            class="text-muted-foreground hover:text-foreground transition-colors p-0.5"
            @click="store.toggleWidget()"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>

        <!-- Playing sounds list -->
        <div class="max-h-72 overflow-y-auto p-2 space-y-1.5">
          <!-- Spotify track (singleton) -->
          <div
            v-if="spotifyStore.isConnected && spotifyStore.isPlaying"
            class="space-y-1.5 pb-1.5 border-b border-border/50"
          >
            <div class="flex items-center gap-2 px-2 py-1.5 rounded-md bg-green-500/5 border border-green-500/20">
              <img
                v-if="spotifyStore.albumArtUrl"
                :src="spotifyStore.albumArtUrl"
                class="h-7 w-7 rounded shrink-0 object-cover"
                alt=""
              />
              <div class="flex-1 min-w-0">
                <p class="font-cinzel text-xs font-medium text-foreground truncate">
                  {{ spotifyStore.trackName }}
                </p>
                <p class="font-fell text-[10px] text-muted-foreground truncate">
                  {{ spotifyStore.artistName }}
                </p>
              </div>
              <!-- Volume -->
              <input
                type="range"
                min="0"
                max="1"
                step="0.02"
                class="w-14 h-1 accent-green-500 shrink-0"
                :value="spotifyStore.volume"
                @input="spotifyStore.setVolume(+($event.target as HTMLInputElement).value)"
              />
              <!-- Prev / Pause / Next -->
              <button
                class="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                title="Previous track"
                @click="spotifyStore.previousTrack()"
              >
                <SkipBack class="h-3 w-3" />
              </button>
              <button
                class="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                title="Pause Spotify"
                @click="spotifyStore.pause()"
              >
                <Pause class="h-3 w-3" />
              </button>
              <button
                class="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                title="Next track"
                @click="spotifyStore.nextTrack()"
              >
                <SkipForward class="h-3 w-3" />
              </button>
            </div>

            <!-- Spotify progress bar -->
            <div
              v-if="spotifyStore.durationMs > 0"
              class="flex items-center gap-1.5 px-2"
            >
              <span class="font-fell text-[9px] text-muted-foreground tabular-nums">
                {{ formatSpotifyTime(spotifyStore.positionMs) }}
              </span>
              <div class="flex-1 h-1 bg-border/50 rounded-full">
                <div
                  class="h-full bg-green-500/50 rounded-full"
                  :style="{ width: spotifyProgress + '%' }"
                />
              </div>
              <span class="font-fell text-[9px] text-muted-foreground tabular-nums">
                {{ formatSpotifyTime(spotifyStore.durationMs) }}
              </span>
            </div>
          </div>

          <!-- HTML audio sounds -->
          <template v-if="playingSounds.length > 0">
            <div
              v-for="sound in playingSounds"
              :key="sound.id"
              class="flex items-center gap-2 px-2 py-1.5 rounded-md bg-gold-500/5 border border-gold-500/20"
            >
              <p class="font-cinzel text-xs font-medium text-foreground truncate flex-1 min-w-0">{{ sound.name }}</p>
              <!-- Volume -->
              <input
                type="range"
                min="0"
                max="1"
                step="0.02"
                class="w-16 h-1 accent-gold-500 shrink-0"
                :value="store.getState(sound.id).volume"
                @input="store.setVolume(sound.id, +($event.target as HTMLInputElement).value)"
              />
              <!-- Stop -->
              <button
                class="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                title="Stop"
                @click="store.stop(sound.id)"
              >
                <Square class="h-3 w-3" />
              </button>
            </div>
          </template>

          <!-- Empty state -->
          <div
            v-if="playingSounds.length === 0 && !spotifyStore.isPlaying"
            class="py-6 text-center"
          >
            <VolumeX class="h-6 w-6 text-muted-foreground/40 mx-auto mb-1.5" />
            <p class="font-fell text-xs text-muted-foreground italic">No sounds playing</p>
            <RouterLink
              to="/soundboard"
              class="font-fell text-[11px] text-gold-400 hover:text-gold-300 transition-colors"
              @click="store.widgetOpen = false"
            >
              Open Soundboard →
            </RouterLink>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Music2, X, Square, Pause, SkipBack, SkipForward, VolumeX } from "lucide-vue-next";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSpotifyStore } from "@/stores/spotify";
import { useSounds } from "@/composables/useSounds";

const store = useSoundboardStore();
const spotifyStore = useSpotifyStore();
const { data: sounds } = useSounds();

const playingSounds = computed(() =>
  (sounds.value ?? []).filter(
    (s) => s.source_type !== "spotify" && store.playbackStates[s.id]?.isPlaying,
  ),
);

const spotifyProgress = computed(() => {
  if (!spotifyStore.durationMs) return 0;
  return Math.min(100, (spotifyStore.positionMs / spotifyStore.durationMs) * 100);
});

function formatSpotifyTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function stopAll() {
  store.stopAll();
  if (spotifyStore.isPlaying) spotifyStore.pause();
}
</script>
