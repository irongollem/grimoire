<template>
  <div v-if="scene" class="space-y-1.5">
    <div class="flex items-center gap-1.5">
      <IconWind class="h-3.5 w-3.5 shrink-0 text-gold-400" />
      <span class="flex-1 truncate font-cinzel text-2xs font-semibold tracking-wide text-foreground">
        {{ scene.playlistName }}
      </span>
      <span class="text-2xs text-muted-foreground">{{ scene.soundIds.length }} layers</span>
    </div>

    <div
      v-for="id in scene.soundIds"
      :key="id"
      class="flex items-center gap-2"
    >
      <span class="w-24 shrink-0 truncate text-2xs text-muted-foreground" :title="layerName(id)">
        {{ layerName(id) }}
      </span>
      <!-- A generator has no continuously audible level, so its fader sets the
           ceiling that each random firing is drawn against. -->
      <span
        v-if="scene.generators[id]"
        class="shrink-0 rounded border border-gold-500/20 bg-gold-500/10 px-1 text-2xs text-gold-400"
        title="Fires at random intervals rather than looping"
      >
        gen
      </span>
      <VolumeSlider
        class="flex-1"
        wide
        show-percent
        :model-value="scene.layerVolumes[id] ?? 1"
        @update:model-value="store.setLayerVolume(id, $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
// Live mix for the running ambient scene, shared by the /soundboard page and
// the floating widget.
//
// Before this the layers of a scene were unreachable once it started: you could
// stop the whole thing, but not pull the rain down under the tavern. Each fader
// writes to the scene's own remembered level, so it does not disturb how that
// sound behaves anywhere else.
import { computed } from "vue";
import { IconWind } from "@/lib/icons";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSounds } from "@/composables/useSounds";
import VolumeSlider from "./VolumeSlider.vue";

const store = useSoundboardStore();
const { data: sounds } = useSounds();

const scene = computed(() => store.activeAmbientPlaylist);

function layerName(soundId: string): string {
  const match = sounds.value?.find((s) => s.id === soundId);
  // No silent fallback to an empty string — an unnamed layer is a real state
  // worth seeing rather than a blank row.
  return match ? match.name : "???";
}
</script>
