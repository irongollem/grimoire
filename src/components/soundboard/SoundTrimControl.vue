<template>
  <!-- Collapsed: a subtle "Trim…" affordance when untouched (fades in on card
       hover, same as the empty-artist placeholder), or an always-visible gold
       badge once the DM has actually corrected the loudness. -->
  <button
    v-if="!editing"
    type="button"
    class="rounded text-2xs transition-colors"
    :class="isTrimmed
      ? 'flex items-center gap-1 px-1.5 py-0.5 font-cinzel tracking-wide text-gold-400 bg-gold-500/10 border border-gold-500/20 hover:bg-gold-500/20'
      : 'italic text-muted-foreground/40 [@media(hover:hover)]:text-muted-foreground/0 [@media(hover:hover)]:group-hover:text-muted-foreground/40 hover:text-muted-foreground!'"
    :title="isTrimmed ? `Trim ${committedLabel} — click to adjust` : 'Correct this sound\'s loudness'"
    @click="startEdit"
  >{{ isTrimmed ? `Trim ${committedLabel}` : 'Trim…' }}</button>

  <!-- Expanded: a dedicated range distinct from the volume slider — this is a
       persisted per-sound correction, not a live per-session level. -->
  <!-- Overlaid across the card rather than squeezed into the info column,
       where the slider was ~5 thumb-widths wide and useless to drag. Closes on
       blur, so the overlay never lingers. -->
  <div
    v-else
    class="absolute inset-x-2 top-1/2 z-20 flex -translate-y-1/2 items-center gap-1.5 rounded border border-gold-500/40 bg-background px-2 py-1.5 shadow-lg"
  >
    <span class="shrink-0 font-cinzel text-2xs tracking-wide text-muted-foreground">Trim</span>
    <input
      ref="rangeInput"
      type="range"
      :min="MIN_TRIM"
      :max="MAX_TRIM"
      step="0.05"
      class="h-1 min-w-0 flex-1 accent-primary"
      :value="draftTrim"
      aria-label="Trim level"
      @input="onInput"
      @change="onChange"
      @blur="editing = false"
    />
    <span class="w-9 shrink-0 text-right text-2xs text-muted-foreground tabular-nums">{{ draftLabel }}</span>
    <button
      v-if="draftTrim !== 1"
      type="button"
      class="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
      title="Reset trim to 1×"
      @mousedown.prevent="resetTrim"
    >
      <IconReset class="h-3 w-3" />
    </button>
  </div>
</template>

<script setup lang="ts">
// Per-sound loudness correction (sounds.gain_trim). A Freesound clip and an
// uploaded track sit at wildly different perceived levels; trim is the
// one-time fix the DM sets and forgets, distinct from the volume slider
// (live, per-session) that it composes with.
import { computed, nextTick, ref } from "vue";
import { IconReset } from "@/lib/icons";
import { useSoundboardStore } from "@/stores/soundboard";
import { useUpdateSound } from "@/composables/useSounds";
import type { Sound } from "@/types/sound.types";

// Mirrors the `sounds.gain_trim > 0 and <= 4` DB constraint — 0.25 rather than
// a value touching zero so the slider can never silently mute a sound.
const MIN_TRIM = 0.25;
const MAX_TRIM = 4;

const { sound } = defineProps<{
  sound: Sound;
}>();

const soundboardStore = useSoundboardStore();
const { mutate: updateSound } = useUpdateSound();

const editing = ref(false);
const rangeInput = ref<HTMLInputElement | null>(null);
const draftTrim = ref(sound.gain_trim);

const isTrimmed = computed(() => Math.abs(sound.gain_trim - 1) > 0.005);

function formatTrim(value: number): string {
  return `${value.toFixed(2)}×`;
}

const committedLabel = computed(() => formatTrim(sound.gain_trim));
const draftLabel = computed(() => formatTrim(draftTrim.value));

function clamp(value: number): number {
  return Math.max(MIN_TRIM, Math.min(MAX_TRIM, value));
}

function startEdit() {
  draftTrim.value = sound.gain_trim;
  editing.value = true;
  nextTick(() => rangeInput.value?.focus());
}

function onInput(e: Event) {
  const value = clamp(Number((e.target as HTMLInputElement).value));
  draftTrim.value = value;
  soundboardStore.setTrim(sound.id, value); // live preview while dragging
}

function onChange(e: Event) {
  const value = clamp(Number((e.target as HTMLInputElement).value));
  draftTrim.value = value;
  soundboardStore.setTrim(sound.id, value);
  // `change` fires once per interaction (release, or a single keypress) —
  // never per animation frame — so this persists without a manual debounce.
  if (value !== sound.gain_trim) {
    updateSound({ id: sound.id, update: { gain_trim: value } });
  }
}

function resetTrim() {
  draftTrim.value = 1;
  soundboardStore.setTrim(sound.id, 1);
  if (sound.gain_trim !== 1) {
    updateSound({ id: sound.id, update: { gain_trim: 1 } });
  }
}
</script>
