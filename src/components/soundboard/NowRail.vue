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
      class="group/row relative flex min-w-0 flex-[1_1_18rem] items-center gap-2 overflow-hidden rounded-md border border-gold-400/45 bg-gold-400/12 py-1.5 pe-2 ps-3"
    >
      <span class="absolute inset-y-0 inset-s-0 w-0.75 bg-gold-400" />
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
      <AppButton variant="ghost" size="inline-xs" class="shrink-0" :icon="IconSkipBack" tooltip="Previous track" @click="store.musicPlaylistPrev()" />
      <AppButton variant="ghost" size="inline-xs" class="shrink-0" :icon="IconSkipForward" tooltip="Next track" @click="store.musicPlaylistNext()" />
      <AppButton variant="ghost" size="inline-xs" class="shrink-0" :icon="IconStop" tooltip="Stop the music slot" @click="store.stopMusicPlaylist()" />
    </div>

    <!-- Scenes and loose sounds: a second lane that scrolls, because they
         stack. Loose sounds matter as much as the slots — a bed fired straight
         from the grid is exactly as audible as one a scene started, and a rail
         that says "nothing audible" over it is lying. -->
    <div
      v-if="scenes.length > 0 || looseSounds.length > 0"
      class="flex min-w-0 flex-[2_1_20rem] gap-1.5 overflow-x-auto"
    >
      <div
        v-for="scene in scenes"
        :key="scene.playlistId"
        class="group/row relative flex min-w-36 flex-[1_1_10rem] items-center gap-1.5 overflow-hidden rounded-md border border-green-400/40 bg-green-400/10 py-1.5 pe-2 ps-3"
      >
        <span class="absolute inset-y-0 inset-s-0 w-0.75 bg-green-400" />
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
        <AppButton
          variant="ghost" size="inline-xs" class="shrink-0"
          :icon="IconStop"
          :tooltip="`Stop ${scene.playlistName}`"
          @click="store.stopAmbientPlaylist(scene.playlistId)"
        />
      </div>

      <!-- Sounds fired straight from the grid, outside any slot. -->
      <div
        v-for="loose in looseSounds"
        :key="loose.id"
        class="group/row relative flex min-w-32 flex-[1_1_9rem] items-center gap-1.5 overflow-hidden rounded-md border py-1.5 pe-2 ps-3"
        :class="[CATEGORY_LANE_BORDER[loose.category], CATEGORY_LANE_TINT[loose.category]]"
      >
        <span class="absolute inset-y-0 inset-s-0 w-0.75" :class="CATEGORY_SPINE[loose.category]" />
        <EqBars :accent="loose.category" class="shrink-0" />
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 items-center gap-1">
            <span class="truncate font-cinzel text-body-sm font-semibold">{{ loose.name }}</span>
            <CausedByChip :trigger="triggerForSound(loose.id)" small />
          </div>
        </div>
        <AppButton
          variant="ghost" size="inline-xs" class="shrink-0"
          :icon="IconStop"
          :tooltip="`Stop ${loose.name}`"
          @click="store.stop(loose.id)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { IconSkipBack, IconSkipForward, IconStop, IconWind } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSounds } from "@/composables/useSounds";
import { useActiveAudioTriggers } from "@/composables/useAudioThemeTriggers";
import { CATEGORY_SPINE } from "@/lib/audio/soundCategories";
import CausedByChip from "./CausedByChip.vue";
import EqBars from "./EqBars.vue";
import type { SoundCategory } from "@/types/sound.types";

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
const { musicTrigger, triggerForPlaylist, triggerForSound } = useActiveAudioTriggers();

const music = computed(() => activeMusicPlaylist.value);
const scenes = computed(() => activeAmbientPlaylists.value);

const { data: sounds } = useSounds();

/** Lane colouring per category — written out for Tailwind's scanner. */
const CATEGORY_LANE_BORDER: Record<SoundCategory, string> = {
  music: "border-gold-400/45",
  ambient: "border-green-400/40",
  effects: "border-blue-500/40",
  misc: "border-arcane-purple-light/40",
};
const CATEGORY_LANE_TINT: Record<SoundCategory, string> = {
  music: "bg-gold-400/12",
  ambient: "bg-green-400/10",
  effects: "bg-blue-500/10",
  misc: "bg-arcane-purple-light/10",
};

/**
 * Audible sounds that belong to no slot — fired straight from the grid or the
 * palette. The rail read only the two playlist slots at first, so a bed
 * started from a pad played under "Nothing audible. The room is yours."
 */
const looseSounds = computed(() => {
  const claimed = new Set<string>();
  const running = music.value;
  if (running !== null) running.trackSoundIds.forEach((id) => claimed.add(id));
  scenes.value.forEach((scene) => scene.soundIds.forEach((id) => claimed.add(id)));

  return Object.entries(store.playbackStates)
    .filter(([id, state]) => state.isPlaying && !claimed.has(id))
    .map(([id]) => {
      const match = sounds.value?.find((s) => s.id === id);
      return {
        id,
        // "???" over blank: a nameless lane row is a real gap worth seeing.
        name: match === undefined ? "???" : match.name,
        category: (match === undefined ? "misc" : match.category) as SoundCategory,
      };
    });
});

const isIdle = computed(
  () => music.value === null && scenes.value.length === 0 && looseSounds.value.length === 0,
);

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
