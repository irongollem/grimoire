<template>
  <!-- ── Page picker (audio sounds only; multiple pages exist) ────────── -->
  <!-- Always shown so a sound can be moved between boards, not only assigned
       when unassigned. -->
  <div
    v-if="pages && pages.length > 1"
    class="flex items-center gap-1.5 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity"
  >
    <IconLayers class="h-3 w-3 text-muted-foreground/50 shrink-0" />
    <select
      class="flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-caption text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gold-500 cursor-pointer"
      :value="sound.page_id ?? ''"
      @change="moveSound({ id: sound.id, pageId: ($event.target as HTMLSelectElement).value || null })"
    >
      <option value="">— Unassigned —</option>
      <option v-for="page in pages" :key="page.id" :value="page.id">{{ page.name }}</option>
    </select>
  </div>

  <!-- ── HTML Audio controls ────────────────────── -->
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
      :title="blockedReason ?? (audioState.isPlaying ? 'Pause' : 'Play')"
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
    <VolumeSlider
      class="flex-1"
      wide
      show-percent
      :model-value="audioState.volume"
      @update:model-value="soundboardStore.setVolume(sound.id, $event)"
    />
  </div>

  <!-- Progress bar (finite tracks only) -->
  <div v-if="audioState.duration > 0" class="flex items-center gap-2">
    <span class="text-caption-sm text-muted-foreground tabular-nums shrink-0">
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
    <span class="text-caption-sm text-muted-foreground tabular-nums shrink-0">
      {{ formatTime(audioState.duration) }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconLayers, IconPause, IconPlay, IconStop } from '@/lib/icons';
import SoundEffectPicker from "./SoundEffectPicker.vue";
import VolumeSlider from "./VolumeSlider.vue";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSoundPlayback } from "@/composables/useSoundPlayback";
import { useMoveSound } from "@/composables/useSounds";
import type { Sound, SoundboardPage } from "@/types/sound.types";

const { sound, pages } = defineProps<{
  sound: Sound;
  pages?: SoundboardPage[];
}>();

const soundboardStore = useSoundboardStore();
const { mutate: moveSound } = useMoveSound();

// Shared with the command palette, so a file this card knows it cannot play is
// never offered as playable there either.
const { blockedReason, toggle: togglePlay } = useSoundPlayback(() => sound);

const audioState = computed(() => soundboardStore.getState(sound.id));
const playBlocked = computed(() => blockedReason.value !== null);

const audioProgressPercent = computed(() => {
  if (!audioState.value.duration) return 0;
  return Math.min(100, (audioState.value.currentTime / audioState.value.duration) * 100);
});

function handleAudioSeek(e: MouseEvent) {
  const bar = e.currentTarget as HTMLElement;
  soundboardStore.seek(sound.id, (e.offsetX / bar.clientWidth) * audioState.value.duration);
}

function formatTime(seconds: number): string {
  const totalSeconds = Math.floor(seconds);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
</script>
