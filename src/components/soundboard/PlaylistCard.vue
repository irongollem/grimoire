<template>
  <div
    class="relative rounded-lg border bg-card p-3 flex flex-col gap-2 transition-all"
    :class="isActive ? 'border-gold-500/40 shadow-md shadow-gold-500/10' : 'border-border hover:border-border/80'"
  >
    <!-- Now-playing pulse -->
    <span
      v-if="isActive"
      class="absolute top-2 inset-e-2 h-2 w-2 rounded-full animate-pulse"
      :class="playlist.playlist_type === 'music' ? 'bg-gold-400' : 'bg-green-400'"
    />

    <!-- Type + name -->
    <div class="flex items-start gap-2 pr-5">
      <component
        :is="typeIcon"
        class="h-4 w-4 shrink-0 mt-0.5"
        :class="playlist.playlist_type === 'music' ? 'text-gold-400' : 'text-green-400'"
      />
      <div class="flex-1 min-w-0">
        <p class="font-cinzel text-xs font-semibold text-foreground leading-snug truncate">
          {{ playlist.name }}
        </p>
        <p class="text-caption-sm text-muted-foreground mt-0.5">
          {{ trackCount }} {{ trackCount === 1 ? "track" : "tracks" }}
          <template v-if="playlist.playlist_type === 'music'">
            <span v-if="playlist.shuffle" class="ml-1 opacity-60">· shuffle</span>
            <span v-if="playlist.repeat" class="ml-1 opacity-60">· repeat</span>
          </template>
        </p>
      </div>
    </div>

    <!-- Themes, plus the badge for a scene that came with the app -->
    <div v-if="playlist.tags.length || isSeeded" class="flex flex-wrap gap-1 px-1">
      <span
        v-for="tag in playlist.tags"
        :key="tag"
        class="shrink-0 rounded border border-border px-1.5 py-0.5 text-caption-sm text-muted-foreground"
      >
        {{ tag }}
      </span>
      <span
        v-if="isSeeded"
        class="shrink-0 rounded border border-gold-500/30 bg-gold-500/10 px-1.5 py-0.5 text-caption-sm text-gold-400"
        title="A starter scene that came with the app — yours to edit or delete"
      >
        seeded
      </span>
    </div>

    <!--
      Its own line, never sharing one. When the chip competes for width with
      tags and badges it is the thing that loses, and a label crushed to "The …"
      answers nothing.
    -->
    <div v-if="trigger !== null" class="px-1">
      <CausedByChip :trigger="trigger" />
    </div>

    <!--
      A scene's shape, before you open it. "3 tracks" says nothing about what
      it will sound like; two beds under two random layers does. The layer
      names follow, so a DM recognises the scene they built rather than
      recognising only its title.
    -->
    <template v-if="playlist.playlist_type === 'ambient' && trackCount > 0">
      <p class="px-1 text-caption-sm text-muted-foreground">
        <span v-if="loopingCount > 0">{{ loopingCount }} looping</span>
        <span v-if="loopingCount > 0 && generatorCount > 0"> · </span>
        <span v-if="generatorCount > 0" class="text-gold-400">{{ generatorCount }} random</span>
      </p>
      <div class="flex flex-wrap gap-1 px-1">
        <span
          v-for="track in layerChips"
          :key="track.id"
          class="max-w-32 shrink-0 truncate rounded border px-1 py-px text-caption-sm"
          :class="track.is_generator
            ? 'border-gold-500/30 bg-gold-500/10 text-gold-400'
            : 'border-border text-muted-foreground'"
          :title="track.is_generator
            ? `${track.sound.name} — fires every ${Math.round(track.min_interval_s)}–${Math.round(track.max_interval_s)} s`
            : `${track.sound.name} — loops continuously`"
        >
          {{ track.sound.name }}
        </span>
        <span v-if="hiddenLayerCount > 0" class="shrink-0 text-caption-sm text-muted-foreground/70">
          +{{ hiddenLayerCount }}
        </span>
      </div>
    </template>

    <!-- Music: current track name when active -->
    <p
      v-if="isActive && playlist.playlist_type === 'music' && currentTrackName"
      class="text-caption text-gold-300 truncate px-1 -mt-1"
    >
      ♪ {{ currentTrackName }}
      <span v-if="tracks && tracks.length > 1" class="text-muted-foreground ml-1">
        {{ (store.activeMusicPlaylist?.currentIndex ?? 0) + 1 }} / {{ tracks.length }}
      </span>
    </p>

    <!-- Controls row -->
    <div class="flex items-center gap-1.5">
      <!-- Not active: Play -->
      <button
        v-if="!isActive"
        class="flex items-center gap-1.5 flex-1 justify-center py-1.5 rounded-md border text-xs font-cinzel tracking-wide transition-colors"
        :class="playlist.playlist_type === 'music'
          ? 'border-gold-500/30 text-gold-400 hover:bg-gold-500/10'
          : 'border-green-500/30 text-green-400 hover:bg-green-500/10'"
        :disabled="tracksLoading || trackCount === 0"
        title="Play"
        @click="togglePlay"
      >
        <IconPlay class="h-3.5 w-3.5" />
        Play
      </button>

      <!-- Active: Pause / Resume + Stop -->
      <template v-else>
        <button
          class="flex items-center gap-1.5 flex-1 justify-center py-1.5 rounded-md border text-xs font-cinzel tracking-wide transition-colors"
          :class="isPaused
            ? (playlist.playlist_type === 'music'
                ? 'border-gold-500/30 text-gold-400 hover:bg-gold-500/10'
                : 'border-green-500/30 text-green-400 hover:bg-green-500/10')
            : 'border-amber-500/40 text-amber-400 hover:bg-amber-500/10'"
          :title="isPaused ? 'Resume' : 'Pause'"
          @click="togglePause"
        >
          <IconPlay v-if="isPaused" class="h-3.5 w-3.5" />
          <IconPause v-else class="h-3.5 w-3.5" />
          {{ isPaused ? "Resume" : "Pause" }}
        </button>
        <button
          class="p-1.5 rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors"
          title="Stop"
          @click="togglePlay"
        >
          <IconStop class="h-3.5 w-3.5" />
        </button>
      </template>

      <!-- Music: prev / next / cast when active -->
      <template v-if="isActive && playlist.playlist_type === 'music'">
        <button
          class="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
          title="Previous track"
          @click="store.musicPlaylistPrev()"
        >
          <IconSkipBack class="h-3.5 w-3.5" />
        </button>
        <button
          class="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
          title="Next track"
          @click="store.musicPlaylistNext()"
        >
          <IconSkipForward class="h-3.5 w-3.5" />
        </button>
        <CastButton class="p-1.5 rounded-md border border-border" />
      </template>

      <!-- Edit -->
      <button
        class="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
        title="Edit playlist"
        @click="$emit('edit')"
      >
        <IconEdit class="h-3.5 w-3.5" />
      </button>

      <!-- Delete -->
      <button
        class="p-1.5 rounded-md border border-border text-muted-foreground hover:text-destructive transition-colors"
        title="Delete playlist"
        @click="$emit('delete')"
      >
        <IconDelete class="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconPlay, IconPause, IconStop, IconSkipBack, IconSkipForward, IconEdit, IconDelete, IconMusicNote, IconWind } from "@/lib/icons";
import { useSoundboardStore } from "@/stores/soundboard";
import { usePlaylistTracks } from "@/composables/useSoundboardPlaylists";
import { useActiveAudioTriggers } from "@/composables/useAudioThemeTriggers";
import type { SoundboardPlaylist } from "@/types/sound.types";
import CastButton from "./CastButton.vue";
import CausedByChip from "./CausedByChip.vue";

const { playlist } = defineProps<{ playlist: SoundboardPlaylist }>();
defineEmits<{ edit: []; delete: [] }>();

const store = useSoundboardStore();

const { data: tracks, isPending: tracksLoading } = usePlaylistTracks(computed(() => playlist.id));

const { triggerForPlaylist } = useActiveAudioTriggers();
const trigger = computed(() => triggerForPlaylist(playlist.id));

/** Came with the app rather than being built by this DM. */
const isSeeded = computed(() => playlist.library_scene_slug !== null);

// ── Scene shape ───────────────────────────────────────────────────────────
// What a scene will sound like is the thing a DM is choosing between, and
// "3 tracks" does not describe it. Beds and random layers behave completely
// differently, so the split is worth stating on the card.

/** How many chips fit before the card starts looking like a list. */
const LAYER_CHIP_LIMIT = 4;

const sceneLayers = computed(() => (tracks.value === undefined ? [] : tracks.value));
const loopingCount = computed(() => sceneLayers.value.filter((t) => !t.is_generator).length);
const generatorCount = computed(() => sceneLayers.value.filter((t) => t.is_generator).length);
const layerChips = computed(() => sceneLayers.value.slice(0, LAYER_CHIP_LIMIT));
const hiddenLayerCount = computed(() => Math.max(0, sceneLayers.value.length - LAYER_CHIP_LIMIT));

const trackCount = computed(() => tracks.value?.length ?? 0);

// Asked per playlist rather than per slot, because several scenes run at once
// and "is the ambient slot busy" no longer answers "is this card playing".
const isActive = computed(() => store.isPlaylistActive(playlist.id));
const isPaused = computed(() => store.isPlaylistPaused(playlist.id));

const typeIcon = computed(() =>
  playlist.playlist_type === "music" ? IconMusicNote : IconWind,
);

const currentTrackName = computed(() => {
  const mpl = store.activeMusicPlaylist;
  if (!mpl || mpl.playlistId !== playlist.id) return null;
  const soundId = mpl.trackSoundIds[mpl.currentIndex];
  return tracks.value?.find((t) => t.sound.id === soundId)?.sound.name ?? null;
});

// Always scoped to this playlist: stopping a scene from its own card must not
// take down the other scenes stacked with it.
function togglePlay() {
  if (!tracks.value) return;
  if (isActive.value) store.stopPlaylist(playlist.playlist_type, playlist.id);
  else store.playPlaylist(playlist, tracks.value);
}

function togglePause() {
  if (isPaused.value) store.resumePlaylist(playlist.playlist_type, playlist.id);
  else store.pausePlaylist(playlist.playlist_type, playlist.id);
}
</script>
