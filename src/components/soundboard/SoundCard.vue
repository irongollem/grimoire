<template>
  <div
    class="group flex flex-col gap-2 rounded-lg border border-border bg-card p-3 transition-colors"
    :class="isActive ? 'border-gold-500/40 bg-gold-500/5' : ''"
  >
    <!-- Header row -->
    <div class="flex items-start gap-2 min-w-0">
      <!-- Inline label edit -->
      <div class="flex-1 min-w-0">
        <input
          v-if="editingName"
          ref="nameInput"
          v-model="nameDraft"
          type="text"
          class="w-full rounded border border-gold-500/50 bg-background px-1.5 py-0.5 font-cinzel text-sm font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-gold-500"
          @keydown.enter="saveName"
          @keydown.escape="cancelNameEdit"
          @blur="saveName"
        />
        <p v-else class="font-cinzel text-sm font-semibold text-foreground truncate">{{ sound.name }}</p>
        <p class="font-fell text-xs text-muted-foreground italic capitalize">{{ sound.category }}</p>
      </div>

      <!-- Edit name button -->
      <button
        v-if="!editingName"
        class="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
        title="Rename"
        @click="startNameEdit"
      >
        <Pencil class="h-3 w-3" />
      </button>

      <!-- WebM warning -->
      <span
        v-if="isWebM"
        class="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-cinzel text-amber-400/80 bg-amber-500/10 border border-amber-500/20"
        title="Encoded as WebM/Opus — won't play in Safari. Re-upload on Firefox."
      >
        <AlertTriangle class="h-2.5 w-2.5 shrink-0" />
        No Safari
      </span>

      <!-- Loop toggle (audio only) -->
      <button
        v-if="!isSpotify"
        class="shrink-0 p-1 rounded transition-colors"
        :class="
          audioState.isLooping
            ? 'text-gold-400 bg-gold-500/10'
            : 'text-muted-foreground hover:text-foreground'
        "
        title="Toggle loop"
        @click="soundboardStore.toggleLoop(sound.id)"
      >
        <Repeat class="h-3.5 w-3.5" />
      </button>

      <!-- Delete button -->
      <button
        v-if="showDelete"
        class="shrink-0 p-1 rounded text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
        title="Delete sound"
        @click="$emit('delete', sound)"
      >
        <Trash2 class="h-3.5 w-3.5" />
      </button>
    </div>

    <!-- ── Spotify: not this user's feature ─────────────────────────── -->
    <div
      v-if="isSpotify && !spotifyStore.isEnabled"
      class="flex items-center gap-1.5 py-1 px-2 rounded-md bg-border/30"
    >
      <Music2 class="h-3 w-3 text-muted-foreground/50 shrink-0" />
      <p class="font-fell text-xs text-muted-foreground/60 italic">DM audio</p>
    </div>

    <!-- ── Spotify not-connected fallback ─────────────────────────────── -->
    <div
      v-else-if="isSpotify && !spotifyStore.isConnected"
      class="flex items-center gap-2 py-1 px-2 rounded-md bg-green-500/5 border border-green-500/20"
    >
      <Music2 class="h-3.5 w-3.5 text-green-400/70 shrink-0" />
      <p class="font-fell text-xs text-muted-foreground italic flex-1">Connect Spotify to play</p>
      <button
        class="font-fell text-[11px] text-green-400 hover:text-green-300 transition-colors shrink-0"
        @click="spotifyStore.connect()"
      >
        Connect →
      </button>
    </div>

    <!-- ── Spotify ready: album art + track info ──────────────────────── -->
    <template v-else-if="isSpotify && spotifyStore.isConnected">
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
          <p class="font-fell text-xs text-foreground truncate">{{ spotifyStore.trackName }}</p>
          <p class="font-fell text-[10px] text-muted-foreground truncate">{{ spotifyStore.artistName }}</p>
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
          <SkipBack class="h-3 w-3" />
        </button>

        <!-- Play / Pause -->
        <button
          class="flex items-center justify-center w-7 h-7 rounded-full border transition-colors shrink-0"
          :class="
            !spotifyStore.isReady
              ? 'border-border text-muted-foreground/30 cursor-not-allowed'
              : isActive && spotifyStore.isPlaying
              ? 'bg-green-500/20 border-green-500/50 text-green-300 hover:bg-green-500/30'
              : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'
          "
          :title="!spotifyStore.isReady ? 'Spotify connecting…' : isActive && spotifyStore.isPlaying ? 'Pause' : 'Play'"
          :disabled="!spotifyStore.isReady"
          @click="toggleSpotify"
        >
          <Pause v-if="isActive && spotifyStore.isPlaying" class="h-3.5 w-3.5" />
          <Play v-else class="h-3.5 w-3.5 translate-x-px" />
        </button>

        <!-- Next (only when active) -->
        <button
          v-if="isActive"
          class="flex items-center justify-center w-5 h-5 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="Next track"
          @click="spotifyStore.nextTrack()"
        >
          <SkipForward class="h-3 w-3" />
        </button>

        <!-- Volume -->
        <input
          type="range"
          min="0"
          max="1"
          step="0.02"
          class="flex-1 h-1 accent-green-500"
          :value="spotifyStore.volume"
          @input="spotifyStore.setVolume(+($event.target as HTMLInputElement).value)"
        />
        <span class="font-fell text-xs text-muted-foreground w-6 text-right shrink-0">
          {{ Math.round(spotifyStore.volume * 100) }}
        </span>
      </div>

      <!-- Spotify progress bar (only when this card is active) -->
      <div v-if="isActive && spotifyStore.durationMs > 0" class="flex items-center gap-2">
        <span class="font-fell text-[10px] text-muted-foreground tabular-nums shrink-0">
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
        <span class="font-fell text-[10px] text-muted-foreground tabular-nums shrink-0">
          {{ formatTime(spotifyStore.durationMs) }}
        </span>
      </div>

      <!-- Not-ready indicator -->
      <p
        v-if="!spotifyStore.isReady"
        class="font-fell text-[10px] text-muted-foreground italic text-center"
      >
        Connecting to Spotify device…
      </p>
    </template>

    <!-- ── HTML Audio controls ─────────────────────────────────────────── -->
    <template v-else>
      <div class="flex items-center gap-2">
        <!-- Play / Pause -->
        <button
          class="flex items-center justify-center w-7 h-7 rounded-full border transition-colors shrink-0"
          :class="
            playBlocked
              ? 'border-border text-muted-foreground/30 cursor-not-allowed'
              : audioState.isPlaying
              ? 'bg-gold-500/20 border-gold-500/50 text-gold-300 hover:bg-gold-500/30'
              : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'
          "
          :title="playBlocked ? 'WebM — cannot play in Safari' : audioState.isPlaying ? 'Pause' : 'Play'"
          :disabled="playBlocked"
          @click="togglePlay"
        >
          <Pause v-if="audioState.isPlaying" class="h-3.5 w-3.5" />
          <Play v-else class="h-3.5 w-3.5 translate-x-px" />
        </button>

        <!-- Stop -->
        <button
          class="flex items-center justify-center w-6 h-6 rounded border border-border text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="Stop"
          @click="soundboardStore.stop(sound.id)"
        >
          <Square class="h-3 w-3" />
        </button>

        <!-- Volume -->
        <input
          type="range"
          min="0"
          max="1"
          step="0.02"
          class="flex-1 h-1 accent-gold-500"
          :value="audioState.volume"
          @input="soundboardStore.setVolume(sound.id, +($event.target as HTMLInputElement).value)"
        />
        <span class="font-fell text-xs text-muted-foreground w-6 text-right shrink-0">
          {{ Math.round(audioState.volume * 100) }}
        </span>
      </div>

      <!-- Progress bar (finite tracks only) -->
      <div v-if="audioState.duration > 0" class="flex items-center gap-2">
        <span class="font-fell text-[10px] text-muted-foreground tabular-nums shrink-0">
          {{ formatTime(audioState.currentTime) }}
        </span>
        <div
          class="flex-1 relative h-1.5 bg-border/50 rounded-full cursor-pointer"
          @click="handleAudioSeek"
        >
          <div
            class="absolute inset-y-0 left-0 bg-gold-500/60 rounded-full"
            :style="{ width: audioProgressPercent + '%' }"
          />
        </div>
        <span class="font-fell text-[10px] text-muted-foreground tabular-nums shrink-0">
          {{ formatTime(audioState.duration) }}
        </span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick } from "vue";
import { Play, Pause, Square, Repeat, Trash2, AlertTriangle, Pencil, Music2, SkipBack, SkipForward } from "lucide-vue-next";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSpotifyStore } from "@/stores/spotify";
import { useUpdateSound } from "@/composables/useSounds";
import type { Sound } from "@/types/sound.types";

const IS_SAFARI = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

const props = defineProps<{
  sound: Sound;
  showDelete?: boolean;
}>();

defineEmits<{
  (e: "delete", sound: Sound): void;
}>();

const soundboardStore = useSoundboardStore();
const spotifyStore = useSpotifyStore();
const { mutate: updateSound } = useUpdateSound();

// ── Routing to the right playback engine ──────────────────────────────────

const isSpotify = computed(() => props.sound.source_type === "spotify");

// A card is "active" if it's currently the one driving the Spotify player or
// if it's an audio card that is playing.
const isActive = computed(() => {
  if (isSpotify.value) {
    return spotifyStore.lastPlayedUrl === props.sound.file_url && spotifyStore.isPlaying;
  }
  return audioState.value.isPlaying;
});

// ── HTML Audio ────────────────────────────────────────────────────────────

const audioState = computed(() => soundboardStore.getState(props.sound.id));

const isWebM = computed(() => {
  const path = (props.sound.storage_path ?? props.sound.file_url).split("?")[0];
  return path.endsWith(".webm");
});

const playBlocked = computed(() => isWebM.value && IS_SAFARI);

function togglePlay() {
  if (playBlocked.value) return;
  if (audioState.value.isPlaying) {
    soundboardStore.stop(props.sound.id);
  } else {
    soundboardStore.play(props.sound.id, props.sound.file_url);
  }
}

const audioProgressPercent = computed(() => {
  if (!audioState.value.duration) return 0;
  return Math.min(100, (audioState.value.currentTime / audioState.value.duration) * 100);
});

function handleAudioSeek(e: MouseEvent) {
  const bar = e.currentTarget as HTMLElement;
  soundboardStore.seek(props.sound.id, (e.offsetX / bar.clientWidth) * audioState.value.duration);
}

// ── Spotify ───────────────────────────────────────────────────────────────

function toggleSpotify() {
  if (!spotifyStore.isReady) return;
  if (isActive.value) {
    spotifyStore.pause();
  } else {
    spotifyStore.play(props.sound.file_url);
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

// ── Shared helpers ────────────────────────────────────────────────────────

function formatTime(value: number): string {
  // value is seconds for audio, ms for Spotify
  const totalSeconds = isSpotify.value ? Math.floor(value / 1000) : Math.floor(value);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Inline name editing ───────────────────────────────────────────────────

const editingName = ref(false);
const nameInput = ref<HTMLInputElement | null>(null);
const nameDraft = ref("");

function startNameEdit() {
  nameDraft.value = props.sound.name;
  editingName.value = true;
  nextTick(() => nameInput.value?.select());
}

function saveName() {
  const trimmed = nameDraft.value.trim();
  if (trimmed && trimmed !== props.sound.name) {
    updateSound({ id: props.sound.id, update: { name: trimmed } });
  }
  editingName.value = false;
}

function cancelNameEdit() {
  editingName.value = false;
}
</script>
