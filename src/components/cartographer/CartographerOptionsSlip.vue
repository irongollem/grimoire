<template>
  <div
    data-slip
    class="absolute left-2 top-2 z-10 flex max-h-[calc(100%-3rem)] w-[min(20rem,calc(100%-1rem))] flex-col gap-2 overflow-y-auto rounded-md border border-border bg-card/95 px-3 py-2 shadow-md"
  >
    <!-- Floating at the canvas's top left, where the eye lands: the family by name with a
         line saying what it is for, its tools as a grid you can reach without the keyboard,
         then whatever the armed tool offers. `data-slip` draws it as a torn slip (Vellum ink). -->
    <header class="flex flex-wrap items-baseline gap-x-2">
      <span class="text-label-lg font-semibold text-foreground">{{ title }}</span>
      <span v-if="caption" class="text-caption text-muted-foreground">{{ caption }}</span>
    </header>

    <div v-if="tools && tools.length > 1" class="grid grid-cols-3 gap-1" role="group" :aria-label="`${title} tools`">
      <AppButton
        v-for="t in tools"
        :key="t.id"
        variant="ghost"
        fill="muted"
        size="xs"
        class="justify-between gap-1 border px-1.5"
        :class="activeTool === t.id ? 'border-primary/70 bg-primary/15 text-foreground' : 'border-border/60'"
        :active="activeTool === t.id"
        :aria-pressed="activeTool === t.id"
        :disabled="t.disabled"
        @click="$emit('update:activeTool', t.id)"
      >
        <span class="truncate">{{ t.label }}</span>
        <kbd v-if="t.shortcut" class="font-mono text-caption-sm text-muted-foreground">{{ t.shortcut.toUpperCase() }}</kbd>
      </AppButton>
    </div>

    <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <slot />
    </div>

    <p v-if="hints" class="flex flex-wrap items-center gap-x-1.5 border-t border-border/60 pt-1.5 text-caption-sm text-muted-foreground">
      <span><kbd :class="KEY_CAP">Alt</kbd> erases</span>
      <span aria-hidden="true">·</span>
      <span><kbd :class="KEY_CAP">Shift</kbd> straight</span>
      <span aria-hidden="true">·</span>
      <span><kbd :class="KEY_CAP">Space</kbd> pans</span>
    </p>
  </div>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import type { RailTool } from "@/components/cartographer/CartographerToolRail.vue";

defineProps<{
  /** The family's name ("Draw"). */
  title: string;
  /** What the family is for, or what the armed tool is doing ("floor, in Flagstone"). */
  caption?: string;
  /** The family's tools, shown as a grid when there is more than one to choose from. */
  tools?: RailTool[];
  activeTool?: string;
  /** The modifier row: Alt, Shift and Space mean the same under every Drawing tool. */
  hints?: boolean;
}>();

defineEmits<{ "update:activeTool": [tool: string] }>();

const KEY_CAP = "rounded border border-border bg-secondary/40 px-1 font-mono text-caption-sm text-foreground";
</script>
