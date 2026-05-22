<template>
  <div
    class="group flex flex-col gap-2 rounded-lg border border-border bg-card p-3 transition-colors"
    :class="isActive ? 'border-gold-500/40 bg-gold-500/5' : ''"
  >
    <!-- Header row -->
    <div class="flex items-start gap-2 min-w-0">
      <!-- Thumbnail (click to upload / replace) -->
      <button
        v-if="!isSpotify"
        type="button"
        class="relative shrink-0 w-8 h-8 rounded overflow-hidden border border-border bg-border/30 flex items-center justify-center group/thumb transition-colors hover:border-gold-500/40"
        :title="sound.thumbnail_url ? 'Replace artwork' : 'Add artwork'"
        :disabled="isUploadingThumb"
        @click="thumbInputRef?.click()"
      >
        <img
          v-if="sound.thumbnail_url"
          :src="sound.thumbnail_url"
          class="w-full h-full object-cover"
          alt=""
        />
        <IconImage v-else class="h-3.5 w-3.5 text-muted-foreground/40 group-hover/thumb:text-muted-foreground transition-colors" />
        <!-- Uploading spinner -->
        <div v-if="isUploadingThumb" class="absolute inset-0 flex items-center justify-center bg-background/70">
          <div class="w-3 h-3 rounded-full border border-gold-500/60 border-t-transparent animate-spin" />
        </div>
      </button>
      <input
        ref="thumbInputRef"
        type="file"
        accept="image/*"
        class="sr-only"
        @change="handleThumbChange"
      />

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
        class="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground transition-colors [@media(hover:hover)]:opacity-0 group-hover:opacity-100"
        title="Rename"
        @click="startNameEdit"
      >
        <IconEdit class="h-3 w-3" />
      </button>

      <!-- WebM warning -->
      <span
        v-if="isWebM"
        class="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-cinzel text-amber-400/80 bg-amber-500/10 border border-amber-500/20"
        title="Encoded as WebM/Opus — won't play in Safari. Re-upload on Firefox."
      >
        <IconWarning class="h-2.5 w-2.5 shrink-0" />
        No Safari
      </span>

      <!-- Source unavailable (e.g. Freesound 502 after retry) -->
      <span
        v-if="audioState.loadError"
        class="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-cinzel text-amber-400/80 bg-amber-500/10 border border-amber-500/20"
        title="The source server didn't return this file. May be temporary — try again later, or delete and re-add."
      >
        <IconWarning class="h-2.5 w-2.5 shrink-0" />
        Source error
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
        <IconRepeat class="h-3.5 w-3.5" />
      </button>

      <!-- Delete button -->
      <button
        v-if="showDelete"
        class="shrink-0 p-1 rounded text-muted-foreground hover:text-destructive transition-colors [@media(hover:hover)]:opacity-0 group-hover:opacity-100"
        title="Delete sound"
        @click="$emit('delete', sound)"
      >
        <IconDelete class="h-3.5 w-3.5" />
      </button>
    </div>

    <!-- ── Spotify: not this user's feature ─────────────────────────── -->
    <div
      v-if="isSpotify && !spotifyStore.isEnabled"
      class="flex items-center gap-1.5 py-1 px-2 rounded-md bg-border/30"
    >
      <IconMusicNote class="h-3 w-3 text-muted-foreground/50 shrink-0" />
      <p class="font-fell text-xs text-muted-foreground/60 italic">DM audio</p>
    </div>

    <!-- ── Spotify not-connected fallback ─────────────────────────────── -->
    <div
      v-else-if="isSpotify && !spotifyStore.isConnected"
      class="flex items-center gap-2 py-1 px-2 rounded-md bg-green-500/5 border border-green-500/20"
    >
      <IconMusicNote class="h-3.5 w-3.5 text-green-400/70 shrink-0" />
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
        <input
          type="range"
          min="0"
          max="1"
          step="0.02"
          class="flex-1 min-w-0 h-1 accent-green-500"
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
          title="IconShuffle"
          @click="spotifyStore.setShuffle(!spotifyStore.shuffleOn)"
        >
          <IconShuffle class="h-2.5 w-2.5" />
        </button>
      </div>

      <!-- Not-ready indicator -->
      <p
        v-if="!spotifyStore.isReady"
        class="font-fell text-[10px] text-muted-foreground italic text-center"
      >
        Connecting to Spotify device…
      </p>
    </template>

    <!-- ── Page picker (audio sounds only; multiple pages exist) ────────── -->
    <div
      v-if="!isSpotify && pages && pages.length > 1 && !sound.page_id"
      class="flex items-center gap-1.5 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity"
    >
      <IconLayers class="h-3 w-3 text-muted-foreground/50 shrink-0" />
      <select
        class="flex-1 rounded border border-border bg-background px-1.5 py-0.5 font-fell text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gold-500 cursor-pointer"
        :value="sound.page_id ?? ''"
        @change="moveSound({ id: sound.id, pageId: ($event.target as HTMLSelectElement).value || null })"
      >
        <option value="">— Unassigned —</option>
        <option v-for="page in pages" :key="page.id" :value="page.id">{{ page.name }}</option>
      </select>
    </div>

    <!-- ── HTML Audio controls (non-Spotify sounds only) ────────────────── -->
    <template v-if="!isSpotify">
      <div class="flex items-center gap-2">
        <!-- IconPlay / IconPause -->
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
          <IconPause v-if="audioState.isPlaying" class="h-3.5 w-3.5" />
          <IconPlay v-else class="h-3.5 w-3.5 translate-x-px" />
        </button>

        <!-- Stop -->
        <button
          class="flex items-center justify-center w-6 h-6 rounded border border-border text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="Stop"
          @click="soundboardStore.stop(sound.id)"
        >
          <IconStop class="h-3 w-3" />
        </button>

        <!-- Effect picker (visible while playing) -->
        <SoundEffectPicker
          v-if="audioState.isPlaying"
          :model-value="soundboardStore.soundEffects?.[sound.id] ?? 'none'"
          @update:model-value="soundboardStore.setEffect(sound.id, sound.file_url, $event)"
        />

        <!-- Volume -->
        <input
          type="range"
          min="0"
          max="1"
          step="0.02"
          class="flex-1 min-w-0 h-1 accent-gold-500"
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

    <!-- Attribution (Freesound CC-BY etc.) -->
    <a
      v-if="sound.attribution"
      :href="sound.attribution_url ?? undefined"
      target="_blank"
      rel="noopener noreferrer"
      class="font-fell text-[10px] text-muted-foreground/70 hover:text-muted-foreground italic truncate"
      :title="sound.attribution"
    >
      {{ sound.attribution }}
    </a>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, onMounted } from "vue";
import { IconDelete, IconEdit, IconImage, IconLayers, IconMusicNote, IconPause, IconPlay, IconRepeat, IconRepeatOne, IconShuffle, IconSkipBack, IconSkipForward, IconStop, IconWarning } from '@/lib/icons';
import SoundEffectPicker from "./SoundEffectPicker.vue";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSpotifyStore } from "@/stores/spotify";
import { useUpdateSound, useMoveSound, useSoundThumbnailUpload } from "@/composables/useSounds";
import type { Sound, SoundboardPage } from "@/types/sound.types";

const IS_SAFARI = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

const props = defineProps<{
  sound: Sound;
  showDelete?: boolean;
  pages?: SoundboardPage[];
}>();

defineEmits<{
  (e: "delete", sound: Sound): void;
}>();

const soundboardStore = useSoundboardStore();
const spotifyStore = useSpotifyStore();
const { mutate: updateSound } = useUpdateSound();
const { mutate: moveSound } = useMoveSound();

// ── Thumbnail upload ───────────────────────────────────────────────────────

const thumbInputRef = ref<HTMLInputElement | null>(null);
const { isUploading: isUploadingThumb, upload: uploadThumb, remove: removeThumb } = useSoundThumbnailUpload();

async function handleThumbChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  (e.target as HTMLInputElement).value = ""; // reset so same file can be re-selected
  // Remove old thumbnail from storage before uploading the new one
  if (props.sound.thumbnail_url) {
    await removeThumb(props.sound.thumbnail_url);
  }
  const url = await uploadThumb(file);
  if (url) {
    updateSound({ id: props.sound.id, update: { thumbnail_url: url } });
  }
}

// ── Routing to the right playback engine ──────────────────────────────────

const isSpotify = computed(() => props.sound.source_type === "spotify");

// Kick off the network fetch as soon as the card is mounted so the file is
// already buffered when the DM clicks play. Skipped for Spotify (no <audio>).
onMounted(() => {
  if (!isSpotify.value) {
    soundboardStore.warmup(props.sound.id, props.sound.file_url);
  }
});

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

const playBlocked = computed(() => (isWebM.value && IS_SAFARI) || audioState.value.loadError);

function togglePlay() {
  if (playBlocked.value) return;
  if (audioState.value.isPlaying) {
    soundboardStore.pause(props.sound.id);
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

// ── Spotify repeat / shuffle ──────────────────────────────────────────────

const repeatTitle = computed(() => {
  if (spotifyStore.repeatMode === 2) return "IconRepeat: Track";
  if (spotifyStore.repeatMode === 1) return "IconRepeat: Context";
  return "IconRepeat: Off";
});

function cycleRepeat() {
  const next = ((spotifyStore.repeatMode + 1) % 3) as 0 | 1 | 2;
  spotifyStore.setRepeat(next);
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
