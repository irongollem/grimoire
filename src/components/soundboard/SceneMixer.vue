<template>
  <div v-if="scenes.length > 0" class="space-y-1.5">
    <div
      v-for="scene in scenes"
      :key="scene.playlistId"
      class="overflow-hidden rounded-sm border border-border/60 bg-card/40"
    >
      <div class="flex items-center gap-1.5 border-l-[0.1875rem] border-l-green-400 px-1.5 py-1">
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-1 text-left text-foreground"
          :aria-expanded="isOpen(scene.playlistId)"
          @click="toggle(scene.playlistId)"
        >
          <IconChevronRight
            class="h-2.5 w-2.5 shrink-0 text-muted-foreground transition-transform"
            :class="isOpen(scene.playlistId) ? 'rotate-90' : ''"
          />
          <span class="min-w-0 flex-1 truncate font-cinzel text-2xs font-semibold tracking-wide">
            {{ scene.playlistName }}
          </span>
          <CausedByChip :trigger="triggerForPlaylist(scene.playlistId)" small />
          <!-- Collapsed summary: layer count and the average level, so a folded
               scene still says something rather than reading as nothing. -->
          <span v-if="!isOpen(scene.playlistId)" class="shrink-0 text-2xs tabular-nums text-muted-foreground">
            {{ scene.soundIds.length }}L · {{ averageLevel(scene) }}
          </span>
        </button>
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

      <div v-if="isOpen(scene.playlistId)" class="space-y-0.5 py-1 pr-1.5 pl-4">
        <div v-for="id in scene.soundIds" :key="id" class="flex items-center gap-2">
          <span class="w-22 shrink-0 truncate text-2xs text-muted-foreground" :title="layerName(id)">
            {{ layerName(id) }}
          </span>
          <!-- A generator has no continuously audible level, so its fader sets the
               ceiling that each random firing is drawn against. -->
          <span
            v-if="scene.generators[id]"
            class="shrink-0 rounded border border-gold-500/20 bg-gold-500/10 px-1 text-2xs text-gold-400"
            title="Fires at random intervals rather than looping — this fader is the ceiling, not a live level"
          >
            gen
          </span>
          <VolumeSlider
            class="flex-1"
            wide
            show-percent
            :accent="scene.generators[id] ? 'gold' : 'green'"
            :model-value="layerVolume(scene, id)"
            @update:model-value="store.setLayerVolume(id, $event)"
          />
        </div>
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
//
// Each scene collapses because two stacked scenes at four layers each is ten
// rows, which does not fit the widget. The newest is open by default: a folded
// grey row is indistinguishable from nothing happening, and something *is*.
import { computed, ref, watch } from "vue";
import { IconChevronRight } from "@/lib/icons";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSounds } from "@/composables/useSounds";
import { useActiveAudioTriggers } from "@/composables/useAudioThemeTriggers";
import VolumeSlider from "./VolumeSlider.vue";
import CausedByChip from "./CausedByChip.vue";

interface RunningScene {
  playlistId: string;
  playlistName: string;
  soundIds: string[];
  layerVolumes: Record<string, number>;
  generators: Record<string, boolean>;
}

const store = useSoundboardStore();
const { data: sounds } = useSounds();
const { triggerForPlaylist } = useActiveAudioTriggers();

const scenes = computed(() => store.activeAmbientPlaylists);

const collapsed = ref<Set<string>>(new Set());

// A newly started scene opens itself. Anything the DM folded stays folded.
watch(
  () => scenes.value.map((scene) => scene.playlistId).join("|"),
  () => {
    const running = new Set(scenes.value.map((scene) => scene.playlistId));
    collapsed.value = new Set([...collapsed.value].filter((id) => running.has(id)));
  },
);

function isOpen(playlistId: string): boolean {
  return !collapsed.value.has(playlistId);
}

function toggle(playlistId: string): void {
  const next = new Set(collapsed.value);
  if (next.has(playlistId)) next.delete(playlistId);
  else next.add(playlistId);
  collapsed.value = next;
}

function layerVolume(scene: RunningScene, soundId: string): number {
  const level = scene.layerVolumes[soundId];
  return level === undefined ? 1 : level;
}

function averageLevel(scene: RunningScene): number {
  if (scene.soundIds.length === 0) return 0;
  const total = scene.soundIds.reduce((sum, id) => sum + layerVolume(scene, id), 0);
  return Math.round((total / scene.soundIds.length) * 100);
}

function layerName(soundId: string): string {
  const match = sounds.value?.find((s) => s.id === soundId);
  // No silent fallback to an empty string — an unnamed layer is a real state
  // worth seeing rather than a blank row.
  return match ? match.name : "???";
}
</script>
