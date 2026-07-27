<template>
  <button
    type="button"
    class="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors"
    :class="[
      focused ? 'bg-secondary/70' : 'hover:bg-secondary/40',
      blockedReason === null ? '' : 'opacity-50',
    ]"
    :disabled="blockedReason !== null"
    :title="blockedReason ?? undefined"
    @click="$emit('fire')"
    @mouseenter="$emit('focus')"
  >
    <component :is="icon" class="h-3.5 w-3.5 shrink-0" :class="active ? 'text-gold-400' : 'text-muted-foreground/60'" />

    <span class="min-w-0 flex-1 truncate text-body" :class="active ? 'text-gold-300' : 'text-foreground'">
      {{ name }}
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
