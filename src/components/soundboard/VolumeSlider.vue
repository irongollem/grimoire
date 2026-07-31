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
      class="h-1 shrink-0 min-w-0 disabled:cursor-not-allowed disabled:opacity-40"
      :class="[wide ? 'flex-1' : compact ? 'w-10' : 'w-16', ACCENT_CLASS[accent]]"
      :value="modelValue"
      :aria-label="label ? `${label} volume` : 'Volume'"
      :disabled="!!disabledReason"
      :title="disabledReason || undefined"
      @input="onInput"
    />
    <span
      v-if="showPercent"
      class="text-2xs tabular-nums shrink-0 w-8 text-right"
      :class="disabledReason ? 'text-muted-foreground/40' : 'text-muted-foreground'"
    >
      {{ disabledReason ? "—" : Math.round(modelValue * 100) }}
    </span>
  </div>
</template>

<script setup lang="ts">
// One slider for every level in the soundboard: master, the three buses,
// per-sound, and Spotify. These were four copies of the same markup before the
// bus graph added two more places that needed one.

// Written out in full so Tailwind's scanner can see every class name — an
// interpolated `accent-${x}-500` would compile to nothing.
//
// Four accents rather than two because category colour is load-bearing across
// the soundboard, and effects and misc had no colour of their own before.
const ACCENT_CLASS = {
  gold: "accent-gold-500",
  green: "accent-green-500",
  blue: "accent-blue-500",
  purple: "accent-arcane-purple-light",
} as const;

// Per-category accents are mapped in `src/lib/audio/soundCategories.ts` — kept out of
// here because `<script setup>` cannot export, and several other surfaces need
// the same mapping.

const {
  modelValue,
  label = "",
  showPercent = false,
  wide = false,
  compact = false,
  muted = false,
  accent = "gold",
  disabledReason = null,
} = defineProps<{
  modelValue: number;
  /** Shown ahead of the track, and used as the accessible name. */
  label?: string;
  /** Show the 0–100 readout after the track. */
  showPercent?: boolean;
  /** Fill available width instead of the fixed width. */
  wide?: boolean;
  /** Narrower fixed width, for widget rows where the default is too greedy. Ignored when `wide`. */
  compact?: boolean;
  /** Dim the label — used when the level is inaudible because a parent is at zero. */
  muted?: boolean;
  /** Category colour, or green for Spotify's own branding. */
  accent?: keyof typeof ACCENT_CLASS;
  /**
   * Why this level cannot be changed right now, or null when it can.
   *
   * Set for every fader that drives the audio engine, so direct output on iOS
   * shows a disabled control with an explanation instead of one that slides
   * and silently does nothing. Spotify's fader goes through its own Web API
   * and keeps working, so it never passes this.
   */
  disabledReason?: string | null;
}>();

const emit = defineEmits<{ "update:modelValue": [value: number] }>();

function onInput(event: Event): void {
  emit("update:modelValue", Number((event.target as HTMLInputElement).value));
}
</script>
