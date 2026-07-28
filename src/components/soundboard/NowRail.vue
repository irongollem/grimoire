<template>
  <div
    class="flex min-h-13 items-stretch gap-2 border-b border-gold-500/25 bg-card px-3 py-2"
  >
    <span
      class="shrink-0 self-stretch font-cinzel text-2xs font-bold tracking-[0.2em] text-gold-500 [writing-mode:vertical-rl] rotate-180"
    >
      NOW
    </span>

    <p v-if="isIdle" class="self-center text-body-sm italic text-muted-foreground">
      Nothing audible. The room is yours.
    </p>

    <!-- Music: one lane, because the slot is exclusive. -->
    <div
      v-if="music !== null"
      class="group/row flex min-w-0 flex-[1_1_18rem] items-center gap-2 rounded-md border border-gold-400/45 border-l-[0.1875rem] border-l-gold-400 bg-gold-400/12 px-2 py-1.5"
    >
      <EqBars accent="music" :bars="5" />
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-1.5">
          <span class="truncate font-cinzel text-body-sm font-semibold">{{ music.playlistName }}</span>
          <CausedByChip :trigger="musicTrigger" small />
        </div>
        <p class="truncate text-caption text-foreground/70">
          ♪ {{ currentTrackName }}
          <span class="tabular-nums opacity-60">{{ music.currentIndex + 1 }}/{{ music.trackSoundIds.length }}</span>
        </p>
      </div>
      <button type="button" class="shrink-0 text-muted-foreground hover:text-foreground" title="Previous track" @click="store.musicPlaylistPrev()">
        <IconSkipBack class="h-3.5 w-3.5" />
      </button>
      <button type="button" class="shrink-0 text-muted-foreground hover:text-foreground" title="Next track" @click="store.musicPlaylistNext()">
        <IconSkipForward class="h-3.5 w-3.5" />
      </button>
      <button type="button" class="shrink-0 text-muted-foreground hover:text-foreground" title="Stop the music slot" @click="store.stopMusicPlaylist()">
        <IconStop class="h-3.5 w-3.5" />
      </button>
    </div>

    <!-- Scenes: a second lane that scrolls, because they stack. -->
    <div v-if="scenes.length > 0" class="flex min-w-0 flex-[2_1_20rem] gap-1.5 overflow-x-auto">
      <div
        v-for="scene in scenes"
        :key="scene.playlistId"
        class="group/row flex min-w-36 flex-[1_1_10rem] items-center gap-1.5 rounded-md border border-green-400/40 border-l-[0.1875rem] border-l-green-400 bg-green-400/10 px-2 py-1.5"
      >
        <IconWind class="h-3.5 w-3.5 shrink-0 text-green-400" />
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 items-center gap-1">
            <span class="truncate font-cinzel text-body-sm font-semibold">{{ scene.playlistName }}</span>
            <CausedByChip :trigger="triggerForPlaylist(scene.playlistId)" small />
          </div>
          <p class="text-caption text-foreground/70">
            {{ scene.soundIds.length }} {{ scene.soundIds.length === 1 ? "layer" : "layers" }}
          </p>
        </div>
        <!-- Scoped by id: pulling the rain must not close the tavern. -->
        <button
          type="button"
          class="shrink-0 text-muted-foreground hover:text-foreground"
          :title="`Stop ${scene.playlistName}`"
          @click="store.stopAmbientPlaylist(scene.playlistId)"
        >
          <IconStop class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { IconSkipBack, IconSkipForward, IconStop, IconWind } from "@/lib/icons";
import { useSoundboardStore } from "@/stores/soundboard";
import { useActiveAudioTriggers } from "@/composables/useAudioThemeTriggers";
import CausedByChip from "./CausedByChip.vue";
import EqBars from "./EqBars.vue";

/**
 * What is audible, and why, before anything else on the page.
 *
 * Slot-shaped rather than list-shaped, because that is the actual model: music
 * is exclusive so it gets one lane, scenes stack so they get a scrolling
 * second one. Without this a DM answers "what is playing" by scanning the grid
 * for lit cards, which is exactly the four seconds the feature is meant to save.
 */

const store = useSoundboardStore();
const { activeMusicPlaylist, activeAmbientPlaylists } = storeToRefs(store);
const { musicTrigger, triggerForPlaylist } = useActiveAudioTriggers();

const music = computed(() => activeMusicPlaylist.value);
const scenes = computed(() => activeAmbientPlaylists.value);
const isIdle = computed(() => music.value === null && scenes.value.length === 0);

const currentTrackName = computed(() => {
  const running = music.value;
  if (running === null) return "";
  const soundId = running.trackSoundIds[running.currentIndex];
  if (soundId === undefined) return "";
  const name = running.soundNames[soundId];
  // "???" rather than an empty string: a missing name is a real gap worth
  // seeing, not something to paper over with blank space.
  return name === undefined ? "???" : name;
});
</script>
