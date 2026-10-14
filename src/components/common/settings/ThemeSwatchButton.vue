<template>
  <AppButton variant="outline" fill="muted" size="md" block :active="active" @click="emit('select')">
    <div class="shrink-0 flex gap-1" aria-hidden="true">
      <span class="block h-4 w-4 rounded-full border border-black/10" :style="{ background: theme.vars['--background'] }" />
      <span class="block h-4 w-4 rounded-full border border-black/10" :style="{ background: theme.vars['--primary'] }" />
      <span class="block h-4 w-4 rounded-full border border-black/10" :style="{ background: theme.vars['--card'] }" />
    </div>
    <span class="flex-1 text-left text-caption font-semibold text-foreground">{{ label ?? theme.label }}</span>
    <IconCheck v-if="active" class="h-3.5 w-3.5 shrink-0 text-primary" />
  </AppButton>
</template>

<script setup lang="ts">
/**
 * One theme to choose, shown by three swatches of its own colours (page,
 * accent, card) and its name. The DM's campaign theme list and the player's
 * appearance setting are the same list of these, so the two cannot drift.
 */
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconCheck } from "@/lib/icons";
import type { GrimoireTheme } from "@/lib/themes";

const { theme, active, label } = defineProps<{
  theme: GrimoireTheme;
  active: boolean;
  /** Overrides the theme's own name, as "Follow campaign" does. */
  label?: string;
}>();
const emit = defineEmits<{ select: [] }>();
</script>
