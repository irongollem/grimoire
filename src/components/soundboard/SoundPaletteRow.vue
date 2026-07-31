<template>
  <button
    type="button"
    class="relative flex w-full items-center gap-2 py-2 pr-4 pl-4 text-left transition-colors"
    :class="[
      focused ? 'bg-secondary/70' : 'hover:bg-secondary/40',
      blockedReason === null ? '' : 'opacity-60',
    ]"
    :disabled="blockedReason !== null"
    @click="$emit('fire')"
    @mouseenter="$emit('focus')"
  >
    <!-- Category spine on the focused row only. It tells you what kind of thing
         you are about to fire, without painting a stripe down the whole list. -->
    <span
      v-if="focused"
      class="absolute inset-y-0 inset-s-0 w-0.75"
      :class="spineClass"
    />

    <EqBars v-if="active" :accent="eqAccent" class="shrink-0" />
    <component
      :is="icon"
      v-else
      class="h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
    />

    <span class="min-w-0 flex-1">
      <span class="block truncate text-body" :class="active ? 'text-gold-300' : 'text-foreground'">
        {{ name }}
      </span>
      <!-- Why it cannot play, in words, under the name. A disabled row with a
           tooltip is a dead end on a touch device. -->
      <span v-if="blockedReason !== null" class="block truncate text-caption-sm text-destructive">
        {{ blockedReason }}
      </span>
    </span>

    <span v-if="hint" class="hidden shrink-0 truncate text-caption text-muted-foreground/70 sm:block">
      {{ hint }}
    </span>

    <span class="shrink-0 rounded border px-1.5 py-0.5 text-caption-sm" :class="chipClass">
      {{ chip }}
    </span>

    <!-- What Enter does to this row. Shown only on the focused one, because a
         column of identical "Play" labels is noise rather than guidance. -->
    <span
      v-if="focused"
      class="w-16 shrink-0 text-right text-caption-sm text-muted-foreground"
    >
      {{ blockedReason === null ? actionLabel : "—" }}
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed, type Component } from "vue";
import EqBars from "./EqBars.vue";
import { CATEGORY_SPINE } from "@/lib/audio/soundCategories";
import type { SoundCategory } from "@/types/sound.types";

const { chip, blockedReason = null } = defineProps<{
  name: string;
  /** Category for a sound, type for a playlist. */
  chip: string;
  hint: string | null;
  icon: Component;
  active: boolean;
  focused: boolean;
  actionLabel: string;
  blockedReason?: string | null;
}>();

defineEmits<{ fire: []; focus: [] }>();

/**
 * The palette lists sounds and playlists together, so `chip` carries either a
 * category or a playlist type. "scene" is an ambient playlist and reads as
 * ambient; anything unrecognised falls back to misc rather than guessing.
 */
const category = computed<SoundCategory>(() => {
  switch (chip) {
    case "music":
    case "ambient":
    case "effects":
      return chip;
    case "scene":
      return "ambient";
    default:
      return "misc";
  }
});

const spineClass = computed(() => CATEGORY_SPINE[category.value]);
const eqAccent = computed(() => category.value);

const chipClass = computed(() => {
  switch (chip) {
    case "music":   return "border-gold-500/30 text-gold-400";
    case "ambient": return "border-green-500/30 text-green-400";
    case "effects": return "border-blue-500/30 text-blue-400";
    case "scene":   return "border-green-500/30 text-green-400";
    default:        return "border-border text-muted-foreground";
  }
});
</script>
