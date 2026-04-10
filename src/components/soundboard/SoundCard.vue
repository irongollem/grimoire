<template>
  <div
    class="group flex flex-col gap-2 rounded-lg border border-border bg-card p-3 transition-colors"
    :class="state.isPlaying ? 'border-gold-500/40 bg-gold-500/5' : ''"
  >
    <!-- Header row -->
    <div class="flex items-start gap-2 min-w-0">
      <div class="flex-1 min-w-0">
        <p class="font-cinzel text-sm font-semibold text-foreground truncate">{{ sound.name }}</p>
        <p class="font-fell text-xs text-muted-foreground italic capitalize">{{ sound.category }}</p>
      </div>

      <!-- WebM warning — always visible so DM knows the file won't play on Safari -->
      <span
        v-if="isWebM"
        class="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-cinzel text-amber-400/80 bg-amber-500/10 border border-amber-500/20"
        title="Encoded as WebM/Opus — won't play in Safari. Re-upload on Firefox to get a Safari-compatible OGG file."
      >
        <AlertTriangle class="h-2.5 w-2.5 shrink-0" />
        No Safari
      </span>

      <!-- Loop toggle -->
      <button
        class="shrink-0 p-1 rounded transition-colors"
        :class="
          state.isLooping
            ? 'text-gold-400 bg-gold-500/10'
            : 'text-muted-foreground hover:text-foreground'
        "
        title="Toggle loop"
        @click="store.toggleLoop(sound.id)"
      >
        <Repeat class="h-3.5 w-3.5" />
      </button>

      <!-- Delete button (optional) -->
      <button
        v-if="showDelete"
        class="shrink-0 p-1 rounded text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
        title="Delete sound"
        @click="$emit('delete', sound)"
      >
        <Trash2 class="h-3.5 w-3.5" />
      </button>
    </div>

    <!-- Playback controls -->
    <div class="flex items-center gap-2">
      <!-- Play / Pause -->
      <button
        class="flex items-center justify-center w-7 h-7 rounded-full border transition-colors shrink-0"
        :class="
          playBlocked
            ? 'border-border text-muted-foreground/30 cursor-not-allowed'
            : state.isPlaying
            ? 'bg-gold-500/20 border-gold-500/50 text-gold-300 hover:bg-gold-500/30'
            : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'
        "
        :title="playBlocked ? 'WebM format — cannot play in Safari' : state.isPlaying ? 'Pause' : 'Play'"
        :disabled="playBlocked"
        @click="togglePlay"
      >
        <Pause v-if="state.isPlaying" class="h-3.5 w-3.5" />
        <Play v-else class="h-3.5 w-3.5 translate-x-px" />
      </button>

      <!-- Stop -->
      <button
        class="flex items-center justify-center w-6 h-6 rounded border border-border text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title="Stop"
        @click="store.stop(sound.id)"
      >
        <Square class="h-3 w-3" />
      </button>

      <!-- Volume slider -->
      <input
        type="range"
        min="0"
        max="1"
        step="0.02"
        class="flex-1 h-1 accent-gold-500"
        :value="state.volume"
        @input="store.setVolume(sound.id, +($event.target as HTMLInputElement).value)"
      />

      <span class="font-fell text-xs text-muted-foreground w-6 text-right shrink-0">
        {{ Math.round(state.volume * 100) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Play, Pause, Square, Repeat, Trash2, AlertTriangle } from "lucide-vue-next";
import { useSoundboardStore } from "@/stores/soundboard";
import type { Sound } from "@/types/sound.types";

// Evaluated once at module load — navigator.userAgent never changes.
const IS_SAFARI = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

const props = defineProps<{
  sound: Sound;
  showDelete?: boolean;
}>();

defineEmits<{
  (e: "delete", sound: Sound): void;
}>();

const store = useSoundboardStore();
const state = computed(() => store.getState(props.sound.id));

const isWebM = computed(() => {
  const path = (props.sound.storage_path ?? props.sound.file_url).split("?")[0];
  return path.endsWith(".webm");
});

const playBlocked = computed(() => isWebM.value && IS_SAFARI);

function togglePlay() {
  if (playBlocked.value) return;
  if (state.value.isPlaying) {
    store.stop(props.sound.id);
  } else {
    store.play(props.sound.id, props.sound.file_url);
  }
}
</script>
