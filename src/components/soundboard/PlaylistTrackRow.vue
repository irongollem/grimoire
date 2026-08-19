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

      <!--
        The row's primary control, always visible. It decides what the layer
        *is* — a bed or a firing schedule — and the numeric detail appears and
        vanishes with it. Hiding this behind a chip that said "generator" was
        the schema vocabulary this control exists to replace.
      -->
      <span v-if="layer" class="inline-flex shrink-0 rounded-md border border-border bg-background p-px">
        <AppButton
          variant="ghost"
          tone="success"
          size="xs"
          class="font-bold uppercase"
          :active="!layer.is_generator"
          :icon="IconRepeat"
          icon-size="xs"
          label="Loop"
          tooltip="Loops continuously underneath the scene"
          @click="patch({ is_generator: false })"
        />
        <AppButton
          variant="ghost"
          tone="primary"
          size="xs"
          class="font-bold uppercase"
          :active="layer.is_generator"
          :icon="IconDice"
          icon-size="xs"
          label="Random"
          tooltip="Fires one-shots at random intervals"
          @click="patch({ is_generator: true })"
        />
      </span>

      <!-- Hear this layer on its own, while deciding about it. -->
      <AppButton
        v-if="layer"
        variant="ghost"
        size="inline-xs"
        class="shrink-0"
        :icon="IconPlay"
        icon-size="xs"
        tooltip="Fire once, to hear it"
        @click="$emit('preview')"
      />

      <!-- The numbers live behind the disclosure; the decision does not. -->
      <AppButton
        v-if="layer"
        variant="ghost"
        size="inline-xs"
        class="shrink-0"
        :aria-expanded="expanded"
        :tooltip="expanded ? 'Hide the numbers' : 'Level, timing and spread'"
        @click="expanded = !expanded"
      >
        <template #icon>
          <IconChevronRight class="h-3 w-3 transition-transform" :class="expanded ? 'rotate-90' : ''" />
        </template>
      </AppButton>

      <!-- Remove button -->
      <AppButton
        variant="ghost"
        tone="danger"
        size="inline-xs"
        class="shrink-0 text-muted-foreground/40 opacity-60 group-hover/row:opacity-100"
        :icon="IconClose"
        tooltip="Remove from playlist"
        @click="$emit('remove')"
      />
    </div>

    <!--
      The sentence, on the closed row. It is the only place a DM learns that
      Level is a ceiling rather than a live volume, so it cannot live behind a
      disclosure nothing hints at. Truncated, it reads as a summary; the full
      text is a hover away and always visible when expanded.
    -->
    <p
      v-if="layer"
      class="px-2 pb-1.5 ps-7.5 text-caption-sm italic text-muted-foreground"
      :class="expanded ? '' : 'truncate'"
      :title="behaviourSentence"
    >
      {{ behaviourSentence }}
    </p>

    <div v-if="layer && expanded" class="space-y-2 border-t border-border/50 px-2 py-2">
      <VolumeSlider
        label="Level"
        wide
        show-percent
        :accent="layer.is_generator ? 'gold' : 'green'"
        :model-value="layer.layer_volume"
        @update:model-value="patch({ layer_volume: $event })"
      />

      <template v-if="layer.is_generator">
        <!--
          Paired controls, one row per range. They are *ranges* — the same
          firing never happening twice is the whole point — and two full-width
          faders stacked on top of each other do not read as one range at all.
        -->
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label class="flex items-center gap-1.5 text-caption text-muted-foreground">
            Every
            <input
              type="number" min="1" max="3600" step="1"
              class="w-14 rounded border border-border bg-background px-1 py-0.5 text-caption text-foreground"
              :value="layer.min_interval_s"
              @change="patchInterval('min', $event)"
            />
            –
            <input
              type="number" min="1" max="3600" step="1"
              class="w-14 rounded border border-border bg-background px-1 py-0.5 text-caption text-foreground"
              :value="layer.max_interval_s"
              @change="patchInterval('max', $event)"
            />
            s
          </label>

          <div class="flex min-w-40 flex-1 items-center gap-1.5">
            <span class="shrink-0 text-caption text-muted-foreground">At</span>
            <VolumeSlider
              class="flex-1"
              wide
              compact
              accent="gold"
              :model-value="layer.min_gain"
              @update:model-value="patchGain('min', $event)"
            />
            <span class="text-caption text-muted-foreground">–</span>
            <VolumeSlider
              class="flex-1"
              wide
              compact
              accent="gold"
              :model-value="layer.max_gain"
              @update:model-value="patchGain('max', $event)"
            />
            <span class="shrink-0 text-caption tabular-nums text-muted-foreground">
              {{ Math.round(layer.min_gain * 100) }}–{{ Math.round(layer.max_gain * 100) }}%
            </span>
          </div>

          <div class="flex min-w-32 items-center gap-1.5">
            <span class="shrink-0 text-caption text-muted-foreground">Spread</span>
            <VolumeSlider
              class="flex-1"
              wide
              compact
              accent="gold"
              :model-value="layer.pan_spread"
              @update:model-value="patch({ pan_spread: $event })"
            />
            <span class="shrink-0 text-caption tabular-nums text-muted-foreground">
              ±{{ Math.round(layer.pan_spread * 100) }}%
            </span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IconDrag, IconClose, IconRepeat, IconPlay, IconDice, IconChevronRight } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import VolumeSlider from "./VolumeSlider.vue";
import type { Sound, PlaylistTrackLayer } from "@/types/sound.types";

const { sound, layer = null } = defineProps<{
  sound: Sound;
  /** Null for music playlists, which have no layer concept. */
  layer?: PlaylistTrackLayer | null;
}>();

const emit = defineEmits<{
  remove: [];
  preview: [];
  "update:layer": [patch: Partial<PlaylistTrackLayer>];
}>();

const expanded = ref(false);

/**
 * What this layer will actually do, in a sentence.
 *
 * The fields are all named after columns. A DM setting up a tavern is deciding
 * how often a mug clatters and how loud, not editing `min_gain`.
 */
const behaviourSentence = computed(() => {
  if (layer === null) return "";
  if (!layer.is_generator) return "Loops continuously for as long as the scene runs.";
  const secs = (n: number) => Math.round(n);
  const pct = (n: number) => Math.round(n * 100);
  return (
    `Fires every ${secs(layer.min_interval_s)}–${secs(layer.max_interval_s)} s ` +
    `at ${pct(layer.min_gain)}–${pct(layer.max_gain)}% of its level, ` +
    `panned up to ${pct(layer.pan_spread)}% off centre. ` +
    `Level is the ceiling those draws sit under, not a live volume.`
  );
});

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
