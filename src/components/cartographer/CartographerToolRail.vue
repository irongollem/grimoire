<template>
  <nav
    aria-label="Map tools"
    class="flex shrink-0 flex-row items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-card p-1 lg:w-12 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden"
  >
    <!-- The tools as an icon rail. Beside the canvas rather than over it: 3rem is a small
         price for a map that no tool ever covers, and it keeps the status bar clear. Below
         lg it lies down as a toolbar along the bottom, where a thumb reaches it. -->
    <template v-for="(group, index) in groups" :key="group.id">
      <span
        v-if="index > 0"
        class="h-6 w-px shrink-0 bg-border lg:my-1 lg:h-px lg:w-6"
        aria-hidden="true"
      ></span>
      <AppButton
        v-for="t in group.tools"
        :key="t.id"
        variant="ghost"
        fill="muted"
        size="icon-xs"
        class="size-7 shrink-0"
        :icon="t.icon"
        :active="activeTool === t.id"
        :aria-pressed="activeTool === t.id"
        :disabled="t.disabled"
        :aria-label="t.label"
        :tooltip="toolTitle(t)"
        @click="$emit('update:activeTool', t.id)"
      />
    </template>
  </nav>
</template>

<script setup lang="ts">
import type { Component } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";

export interface RailTool {
  id: string;
  label: string;
  icon: Component;
  /** Single key that activates the tool (lowercase, no modifiers). */
  shortcut?: string;
  /** Override for the tooltip's key, for hints that are not keyboard keys ("RMB" on Pan). */
  displayBadge?: string;
  disabled?: boolean;
}

export interface RailGroup {
  id: string;
  label: string;
  tools: RailTool[];
}

defineProps<{
  groups: RailGroup[];
  activeTool: string;
}>();

defineEmits<{
  "update:activeTool": [tool: string];
}>();

function toolTitle(t: RailTool): string {
  const key = t.displayBadge ?? t.shortcut?.toUpperCase();
  return key ? `${t.label} (${key})` : t.label;
}
</script>
