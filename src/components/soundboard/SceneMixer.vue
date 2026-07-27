<template>
  <div v-if="scenes.length > 0" class="space-y-2.5">
    <div v-for="scene in scenes" :key="scene.playlistId" class="space-y-1.5">
      <div class="flex items-center gap-1.5">
        <IconWind class="h-3.5 w-3.5 shrink-0 text-gold-400" />
        <span class="flex-1 truncate font-cinzel text-2xs font-semibold tracking-wide text-foreground">
          {{ scene.playlistName }}
        </span>
        <span class="text-2xs text-muted-foreground">{{ scene.soundIds.length }} layers</span>
        <!-- Per-scene stop. With scenes stacked, the global Stop All is too
             blunt: pulling the rain should not also close the tavern. -->
        <button
          type="button"
          class="shrink-0 rounded border border-border px-1 text-2xs text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
          :title="`Stop ${scene.playlistName}`"
          @click="store.stopAmbientPlaylist(scene.playlistId)"
        >
          Stop
        </button>
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
  </div>
</template>

<script setup lang="ts">
// Live mix for every running ambient scene, shared by the /soundboard page and
// the floating widget.
//
// Before this the layers of a scene were unreachable once it started: you could
// stop the whole thing, but not pull the rain down under the tavern. Each fader
// writes to that scene's own remembered level, so it does not disturb how the
// sound behaves anywhere else.
//
// Scenes stack, so this renders a section per scene rather than one. A sound
// belongs to at most one of them — playAmbientPlaylist skips a layer another
// scene already claimed — so no fader here can be ambiguous about what it moves.
import { computed } from "vue";
import { IconWind } from "@/lib/icons";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSounds } from "@/composables/useSounds";
import VolumeSlider from "./VolumeSlider.vue";

const store = useSoundboardStore();
const { data: sounds } = useSounds();

const scenes = computed(() => store.activeAmbientPlaylists);

function layerName(soundId: string): string {
  const match = sounds.value?.find((s) => s.id === soundId);
  // No silent fallback to an empty string — an unnamed layer is a real state
  // worth seeing rather than a blank row.
  return match ? match.name : "???";
}
</script>
