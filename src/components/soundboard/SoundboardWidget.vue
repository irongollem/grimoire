<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200 ease-out"
      leave-active-class="transition-opacity duration-150 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="store.widgetOpen"
        ref="widgetEl"
        class="fixed z-50 w-72 rounded-lg border border-border bg-card shadow-xl"
        :style="posStyle"
        :class="dragging ? 'select-none' : ''"
      >
        <!-- Header — drag handle -->
        <div
          class="flex items-center gap-2 px-3 py-2 border-b border-border cursor-grab active:cursor-grabbing"
          @pointerdown="startDrag"
        >
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
          <!-- Spotify track (singleton) — visible while a track is loaded, even when paused -->
          <div
            v-if="spotifyStore.isConnected && spotifyStore.trackName"
            class="group/spotify space-y-1.5 pb-1.5 border-b border-border/50"
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
              <!-- Prev / Play·Pause / Next -->
              <button
                class="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                title="Previous track"
                @click="spotifyStore.previousTrack()"
              >
                <SkipBack class="h-3 w-3" />
              </button>
              <button
                class="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                :title="spotifyStore.isPlaying ? 'Pause' : 'Resume'"
                @click="spotifyStore.isPlaying ? spotifyStore.pause() : spotifyStore.resume()"
              >
                <Pause v-if="spotifyStore.isPlaying" class="h-3 w-3" />
                <Play v-else class="h-3 w-3" />
              </button>
              <button
                class="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                title="Next track"
                @click="spotifyStore.nextTrack()"
              >
                <SkipForward class="h-3 w-3" />
              </button>
            </div>

            <!-- Progress bar + repeat/shuffle on same row -->
            <div class="flex items-center gap-1.5 px-2">
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
              <!-- Repeat -->
              <button
                class="shrink-0 transition-all opacity-0 group-hover/spotify:opacity-100"
                :class="spotifyStore.repeatMode > 0 ? 'text-green-500' : 'text-muted-foreground hover:text-foreground'"
                :title="repeatTitle"
                @click="cycleRepeat"
              >
                <Repeat1 v-if="spotifyStore.repeatMode === 2" class="h-2.5 w-2.5" />
                <Repeat v-else class="h-2.5 w-2.5" />
              </button>
              <!-- Shuffle -->
              <button
                class="shrink-0 transition-all opacity-0 group-hover/spotify:opacity-100"
                :class="spotifyStore.shuffleOn ? 'text-green-500' : 'text-muted-foreground hover:text-foreground'"
                title="Shuffle"
                @click="spotifyStore.setShuffle(!spotifyStore.shuffleOn)"
              >
                <Shuffle class="h-2.5 w-2.5" />
              </button>
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
import { computed, ref, onMounted, nextTick } from "vue";
import { Music2, X, Square, Pause, Play, SkipBack, SkipForward, VolumeX, Repeat, Repeat1, Shuffle } from "lucide-vue-next";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSpotifyStore } from "@/stores/spotify";
import { useSounds } from "@/composables/useSounds";

const store = useSoundboardStore();
const spotifyStore = useSpotifyStore();
const { data: sounds } = useSounds();

// ── Draggable position ────────────────────────────────────────────────────────

const widgetEl = ref<HTMLElement | null>(null);
const pos = ref<{ x: number; y: number } | null>(null);
const dragging = ref(false);

// The component only exists when widgetOpen is true (v-if), so onMounted
// fires exactly when the widget first appears — initialize position then.
onMounted(async () => {
  await nextTick();
  const h = widgetEl.value?.offsetHeight ?? 320;
  pos.value = {
    x: window.innerWidth - 288 - 16,
    y: window.innerHeight - h - 64,
  };
});

const posStyle = computed(() =>
  pos.value
    ? { left: `${pos.value.x}px`, top: `${pos.value.y}px` }
    : { right: "1rem", bottom: "4rem" },
);

let dragOffset = { x: 0, y: 0 };

function startDrag(e: PointerEvent) {
  if (!pos.value) return;
  e.preventDefault();
  dragging.value = true;
  document.body.style.userSelect = "none";
  dragOffset = { x: e.clientX - pos.value.x, y: e.clientY - pos.value.y };
  window.addEventListener("pointermove", onDrag);
  window.addEventListener("pointerup", stopDrag, { once: true });
}

function onDrag(e: PointerEvent) {
  if (!pos.value) return;
  const w = widgetEl.value?.offsetWidth ?? 288;
  const h = widgetEl.value?.offsetHeight ?? 320;
  pos.value = {
    x: Math.max(0, Math.min(window.innerWidth - w, e.clientX - dragOffset.x)),
    y: Math.max(0, Math.min(window.innerHeight - h, e.clientY - dragOffset.y)),
  };
}

function stopDrag() {
  dragging.value = false;
  document.body.style.userSelect = "";
  window.removeEventListener("pointermove", onDrag);
}

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

const repeatTitle = computed(() => {
  if (spotifyStore.repeatMode === 2) return "Repeat: Track";
  if (spotifyStore.repeatMode === 1) return "Repeat: Context";
  return "Repeat: Off";
});

function cycleRepeat() {
  const next = ((spotifyStore.repeatMode + 1) % 3) as 0 | 1 | 2;
  spotifyStore.setRepeat(next);
}

function stopAll() {
  store.stopAll();
  if (spotifyStore.isPlaying) spotifyStore.pause();
}
</script>
