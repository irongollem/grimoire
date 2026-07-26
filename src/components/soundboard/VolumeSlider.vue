<template>
  <div class="flex items-center gap-2 min-w-0">
    <span
      v-if="label"
      class="font-cinzel text-2xs tracking-wide shrink-0"
      :class="muted ? 'text-muted-foreground/50' : 'text-muted-foreground'"
    >
      {{ label }}
    </span>
    <input
      type="range"
      min="0"
      max="1"
      step="0.02"
      class="h-1 shrink-0 min-w-0"
      :class="[wide ? 'flex-1' : 'w-16', ACCENT_CLASS[accent]]"
      :value="modelValue"
      :aria-label="label ? `${label} volume` : 'Volume'"
      @input="onInput"
    />
    <span
      v-if="showPercent"
      class="text-2xs text-muted-foreground tabular-nums shrink-0 w-8 text-right"
    >
      {{ Math.round(modelValue * 100) }}
    </span>
  </div>
</template>

<script setup lang="ts">
// One slider for every level in the soundboard: master, the three buses,
// per-sound, and Spotify. These were four copies of the same markup before the
// bus graph added two more places that needed one.

// Written out in full so Tailwind's scanner can see both class names.
const ACCENT_CLASS = {
  gold: "accent-gold-500",
  green: "accent-green-500",
} as const;

const {
  modelValue,
  label = "",
  showPercent = false,
  wide = false,
  muted = false,
  accent = "gold",
} = defineProps<{
  modelValue: number;
  /** Shown ahead of the track, and used as the accessible name. */
  label?: string;
  /** Show the 0–100 readout after the track. */
  showPercent?: boolean;
  /** Fill available width instead of the compact fixed width. */
  wide?: boolean;
  /** Dim the label — used when the level is inaudible because a parent is at zero. */
  muted?: boolean;
  /** Spotify's controls are green to match its own branding; everything else is gold. */
  accent?: keyof typeof ACCENT_CLASS;
}>();

const emit = defineEmits<{ "update:modelValue": [value: number] }>();

function onInput(event: Event): void {
  emit("update:modelValue", Number((event.target as HTMLInputElement).value));
}
</script>
