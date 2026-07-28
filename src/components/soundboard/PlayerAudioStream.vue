<template>
  <!-- Nothing at all unless the DM is actually sharing. A dormant control that
       says "no audio" is noise on every other session. -->
  <div
    v-if="isOffered"
    class="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
  >
    <EqBars v-if="joined" accent="music" :bars="5" class="shrink-0" />
    <IconWind v-else class="h-4 w-4 shrink-0 text-gold-400" />

    <div class="min-w-0 flex-1">
      <p class="truncate font-cinzel text-xs text-foreground">
        {{ trackName ?? "The DM is sharing audio" }}
      </p>
      <p v-if="subtitle" class="truncate text-caption-sm text-muted-foreground">
        {{ subtitle }}
      </p>
    </div>

    <!--
      Solid gold and a full 2.75rem tall: this is the primary action on the
      surface, not a confirmation step. A browser will not start audio without
      this press, and nobody's speakers should come alive because someone else
      pressed play — so it has to look like the thing you came here to do.
    -->
    <button
      v-if="!joined"
      type="button"
      class="h-11 shrink-0 rounded-md bg-gold-500 px-4 font-cinzel text-xs font-bold tracking-wide text-navy-950 transition-colors hover:bg-gold-400"
      @click="join"
    >
      Join audio
    </button>

    <template v-else>
      <VolumeSlider
        class="w-24 shrink-0"
        :model-value="volume"
        @update:model-value="setVolume"
      />
      <!-- Recessive on purpose: once you are in, leaving is the rare action. -->
      <button
        type="button"
        class="shrink-0 rounded-md px-2 py-1.5 text-caption text-muted-foreground transition-colors hover:text-foreground"
        title="Stop listening on this device"
        @click="leave"
      >
        Leave
      </button>
    </template>

    <p v-if="blocked" class="w-full text-caption-sm text-destructive">
      Your browser blocked the audio. Tap Join again.
    </p>
  </div>
</template>

<script setup lang="ts">
// Player-side receiver for the DM's shared music.
//
// Sync is approximate by design — each device plays its own copy seeked to the
// offset the DM's anchor implies — so this carries music only. One-shot effects
// would land a second apart across a group, which is worse than not sending
// them.
import { computed } from "vue";
import { IconWind } from "@/lib/icons";
import VolumeSlider from "./VolumeSlider.vue";
import EqBars from "./EqBars.vue";
import { usePlayerAudioStream } from "@/composables/usePlayerAudioStream";

const {
  isOffered, joined, blocked, volume, trackName, playlistName, artist,
  join, leave, setVolume,
} = usePlayerAudioStream();

const subtitle = computed(() => {
  const parts = [artist.value, playlistName.value].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(" · ");
});
</script>
