<template>
  <div
    class="relative rounded-lg border bg-card p-3 flex flex-col gap-2 transition-all"
    :class="isActive ? 'border-gold-500/40 shadow-md shadow-gold-500/10' : 'border-border hover:border-border/80'"
  >
    <!-- Now-playing pulse -->
    <span
      v-if="isActive"
      class="absolute top-2 right-2 h-2 w-2 rounded-full animate-pulse"
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
        <p class="font-fell text-2xs text-muted-foreground mt-0.5">
          {{ trackCount }} {{ trackCount === 1 ? "track" : "tracks" }}
          <template v-if="playlist.playlist_type === 'music'">
            <span v-if="playlist.shuffle" class="ml-1 opacity-60">· shuffle</span>
            <span v-if="playlist.repeat" class="ml-1 opacity-60">· repeat</span>
          </template>
        </p>
      </div>
    </div>

    <!-- Music: current track name when active -->
    <p
      v-if="isActive && playlist.playlist_type === 'music' && currentTrackName"
      class="font-fell text-[0.6875rem] text-gold-300 truncate px-1 -mt-1"
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
import type { SoundboardPlaylist } from "@/types/sound.types";
import CastButton from "./CastButton.vue";

const { playlist } = defineProps<{ playlist: SoundboardPlaylist }>();
defineEmits<{ edit: []; delete: [] }>();

const store = useSoundboardStore();

const { data: tracks, isPending: tracksLoading } = usePlaylistTracks(computed(() => playlist.id));

const trackCount = computed(() => tracks.value?.length ?? 0);

const isActive = computed(() =>
  playlist.playlist_type === "music"
    ? store.activeMusicPlaylist?.playlistId === playlist.id
    : store.activeAmbientPlaylist?.playlistId === playlist.id,
);

const isPaused = computed(() =>
  playlist.playlist_type === "music"
    ? (store.activeMusicPlaylist?.playlistId === playlist.id && store.activeMusicPlaylist?.paused === true)
    : (store.activeAmbientPlaylist?.playlistId === playlist.id && store.activeAmbientPlaylist?.paused === true),
);

const typeIcon = computed(() =>
  playlist.playlist_type === "music" ? IconMusicNote : IconWind,
);

const currentTrackName = computed(() => {
  const mpl = store.activeMusicPlaylist;
  if (!mpl || mpl.playlistId !== playlist.id) return null;
  const soundId = mpl.trackSoundIds[mpl.currentIndex];
  return tracks.value?.find((t) => t.sound.id === soundId)?.sound.name ?? null;
});

function togglePlay() {
  if (!tracks.value) return;

  if (isActive.value) {
    if (playlist.playlist_type === "music") {
      store.stopMusicPlaylist();
    } else {
      store.stopAmbientPlaylist();
    }
    return;
  }

  if (playlist.playlist_type === "music") {
    store.playMusicPlaylist(playlist, tracks.value);
  } else {
    store.playAmbientPlaylist(playlist, tracks.value);
  }
}

function togglePause() {
  if (isPaused.value) {
    if (playlist.playlist_type === "music") {
      store.resumeMusicPlaylist();
    } else {
      store.resumeAmbientPlaylist();
    }
  } else {
    if (playlist.playlist_type === "music") {
      store.pauseMusicPlaylist();
    } else {
      store.pauseAmbientPlaylist();
    }
  }
}
</script>
