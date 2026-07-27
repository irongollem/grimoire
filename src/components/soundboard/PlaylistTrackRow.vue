<template>
  <div class="group/row rounded-md border border-border/50 bg-muted/30">
    <div class="flex items-center gap-2 px-2 py-1.5">
      <!-- Drag handle -->
      <span
        class="drag-handle shrink-0 cursor-grab text-muted-foreground/30 transition-colors hover:text-muted-foreground/60 active:cursor-grabbing"
        title="Drag to reorder"
      >
        <IconDrag class="h-3.5 w-3.5" />
      </span>

      <!-- Track name -->
      <span class="min-w-0 flex-1 truncate font-cinzel text-xs text-foreground">{{ sound.name }}</span>

      <!-- Category chip -->
      <span class="shrink-0 rounded border px-1.5 py-0.5 text-caption-sm" :class="categoryChipClass">
        {{ sound.category }}
      </span>

      <!-- Layer settings — ambient scenes only; a music playlist has no layers -->
      <button
        v-if="layer"
        type="button"
        class="shrink-0 rounded border px-1.5 py-0.5 text-caption-sm transition-colors"
        :class="layer.is_generator
          ? 'border-gold-500/40 bg-gold-500/10 text-gold-400'
          : 'border-border text-muted-foreground hover:text-foreground'"
        :title="layer.is_generator ? 'Fires at random intervals — click to configure' : 'Loops continuously — click to configure'"
        @click="expanded = !expanded"
      >
        {{ layer.is_generator ? "generator" : "loop" }}
      </button>

      <!-- Remove button -->
      <button
        type="button"
        class="shrink-0 text-muted-foreground/40 opacity-60 transition-colors hover:text-destructive group-hover/row:opacity-100"
        title="Remove from playlist"
        @click="$emit('remove')"
      >
        <IconClose class="h-3.5 w-3.5" />
      </button>
    </div>

    <div v-if="layer && expanded" class="space-y-2 border-t border-border/50 px-2 py-2">
      <label class="flex items-center gap-2 text-caption text-muted-foreground">
        <input
          type="checkbox"
          class="accent-gold-500"
          :checked="layer.is_generator"
          @change="patch({ is_generator: ($event.target as HTMLInputElement).checked })"
        />
        Fire at random intervals instead of looping
      </label>

      <VolumeSlider
        label="Level"
        wide
        show-percent
        :model-value="layer.layer_volume"
        @update:model-value="patch({ layer_volume: $event })"
      />

      <template v-if="layer.is_generator">
        <!-- Ranges, not fixed values: identical timing and level every firing is
             exactly what makes ambience sound like a loop. -->
        <div class="flex items-center gap-2">
          <span class="w-20 shrink-0 text-caption text-muted-foreground">Every</span>
          <input
            type="number" min="1" max="3600" step="1"
            class="w-16 rounded border border-border bg-background px-1 py-0.5 text-caption text-foreground"
            :value="layer.min_interval_s"
            @change="patchInterval('min', $event)"
          />
          <span class="text-caption text-muted-foreground">to</span>
          <input
            type="number" min="1" max="3600" step="1"
            class="w-16 rounded border border-border bg-background px-1 py-0.5 text-caption text-foreground"
            :value="layer.max_interval_s"
            @change="patchInterval('max', $event)"
          />
          <span class="text-caption text-muted-foreground">seconds</span>
        </div>

        <VolumeSlider
          label="Quietest"
          wide
          show-percent
          :model-value="layer.min_gain"
          @update:model-value="patchGain('min', $event)"
        />
        <VolumeSlider
          label="Loudest"
          wide
          show-percent
          :model-value="layer.max_gain"
          @update:model-value="patchGain('max', $event)"
        />
        <VolumeSlider
          label="Spread"
          wide
          show-percent
          :model-value="layer.pan_spread"
          @update:model-value="patch({ pan_spread: $event })"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IconDrag, IconClose } from "@/lib/icons";
import VolumeSlider from "./VolumeSlider.vue";
import type { Sound, PlaylistTrackLayer } from "@/types/sound.types";

const { sound, layer = null } = defineProps<{
  sound: Sound;
  /** Null for music playlists, which have no layer concept. */
  layer?: PlaylistTrackLayer | null;
}>();

const emit = defineEmits<{ remove: []; "update:layer": [patch: Partial<PlaylistTrackLayer>] }>();

const expanded = ref(false);

function patch(next: Partial<PlaylistTrackLayer>): void {
  emit("update:layer", next);
}

/**
 * Keep min <= max on both ranges. Dragging one past the other would otherwise
 * persist a pair the DB check constraint rejects, failing the whole save.
 */
function patchInterval(edge: "min" | "max", event: Event): void {
  if (!layer) return;
  const raw = Number((event.target as HTMLInputElement).value);
  const value = Math.max(1, Math.min(3600, raw));
  if (edge === "min") {
    patch({ min_interval_s: value, max_interval_s: Math.max(value, layer.max_interval_s) });
  } else {
    patch({ max_interval_s: value, min_interval_s: Math.min(value, layer.min_interval_s) });
  }
}

function patchGain(edge: "min" | "max", value: number): void {
  if (!layer) return;
  const clamped = Math.max(0.01, Math.min(1, value));
  if (edge === "min") {
    patch({ min_gain: clamped, max_gain: Math.max(clamped, layer.max_gain) });
  } else {
    patch({ max_gain: clamped, min_gain: Math.min(clamped, layer.min_gain) });
  }
}

const categoryChipClass = computed(() => {
  switch (sound.category) {
    case "music":   return "border-gold-500/30 text-gold-400";
    case "ambient": return "border-green-500/30 text-green-400";
    case "effects": return "border-blue-500/30 text-blue-400";
    default:        return "border-border text-muted-foreground";
  }
});
</script>
