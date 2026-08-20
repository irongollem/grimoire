<template>
  <!-- ── HTML Audio controls ────────────────────── -->
  <div class="flex items-center gap-2">
    <!-- IconPlay / IconPause -->
    <AppButton
      variant="subtle"
      shape="pill"
      size="icon-xs"
      class="shrink-0"
      :active="audioState.isPlaying"
      :disabled="playBlocked"
      :tooltip="blockedReason ?? (audioState.isPlaying ? 'Pause' : 'Play')"
      @click="togglePlay"
    >
      <template #icon>
        <IconPause v-if="audioState.isPlaying" class="h-3.5 w-3.5" />
        <IconPlay v-else class="h-3.5 w-3.5 translate-x-px" />
      </template>
    </AppButton>

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
      v-if="audioState.isPlaying && !soundboardStore.directOutput"
      :model-value="soundboardStore.soundEffects?.[sound.id] ?? 'none'"
      @update:model-value="soundboardStore.setEffect(sound.id, sound.file_url, $event, sound.category)"
    />

    <!-- Volume -->
    <VolumeSlider
      class="flex-1"
      wide
      show-percent
      :disabled-reason="soundboardStore.volumeControlNote"
      :model-value="audioState.volume"
      @update:model-value="soundboardStore.setVolume(sound.id, $event)"
    />
  </div>

  <!-- Progress bar. Always rendered: the duration only becomes known on first
       play, and a row that pops in at that moment grows the card and shifts
       the whole grid. Until then it reads –:–– and does not seek. -->
  <div class="flex items-center gap-2" :class="hasDuration ? '' : 'opacity-50'">
    <span class="text-caption-sm text-muted-foreground tabular-nums shrink-0">
      {{ hasDuration ? formatTime(audioState.currentTime) : "–:––" }}
    </span>
    <div
      class="flex-1 relative h-1.5 bg-border/50 rounded-full"
      :class="hasDuration ? 'cursor-pointer' : ''"
      @click="hasDuration ? handleAudioSeek($event) : undefined"
    >
      <div
        class="absolute inset-y-0 inset-s-0 bg-gold-500/60 rounded-full"
        :style="{ width: audioProgressPercent + '%' }"
      />
    </div>
    <span class="text-caption-sm text-muted-foreground tabular-nums shrink-0">
      {{ hasDuration ? formatTime(audioState.duration) : "–:––" }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconPause, IconPlay, IconStop } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import SoundEffectPicker from "./SoundEffectPicker.vue";
import VolumeSlider from "./VolumeSlider.vue";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSoundPlayback } from "@/composables/useSoundPlayback";
import type { Sound } from "@/types/sound.types";

const { sound } = defineProps<{
  sound: Sound;
}>();

const soundboardStore = useSoundboardStore();

// Shared with the command palette, so a file this card knows it cannot play is
// never offered as playable there either.
const { blockedReason, toggle: togglePlay } = useSoundPlayback(() => sound);

const audioState = computed(() => soundboardStore.getState(sound.id));

/** Duration resolves on first play; until then the bar is a placeholder. */
const hasDuration = computed(() => audioState.value.duration > 0);
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
