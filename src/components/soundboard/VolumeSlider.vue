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
// Two accents, and the shrink is the point (#754). This map opened with
// `gold: "accent-gold-500"`, which read as the soundboard's house colour and
// was not one: `--color-gold-500` is the fixed literal #c9920a, `--primary` is
// themed, and they differ by (2,0,1)/255 in the grimoire theme — invisible —
// while diverging visibly in tome. Every session that reached for gold here
// was working where no difference could be seen, so the faders quietly stopped
// following the theme. `primary` follows it, as every other control does.
//
// `blue` and `purple` went with it: they existed for a per-category fader that
// was never built, and neither colour ever reached a call site.
//
// `green` earns its place twice — Spotify's own branding, and the
// generator-vs-file distinction in `SceneMixer` / `PlaylistTrackRow`.
const ACCENT_CLASS = {
  primary: "accent-primary",
  green: "accent-green-500",
} as const;

const {
  modelValue,
  label = "",
  showPercent = false,
  wide = false,
  compact = false,
  muted = false,
  accent = "primary",
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
  /** `green` for Spotify's branding and for file layers sitting beside a generator's; otherwise the themed default. */
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
