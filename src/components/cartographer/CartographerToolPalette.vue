<template>
  <aside class="flex lg:flex-col flex-row gap-1 lg:w-44 shrink-0 bg-card border border-border rounded-lg p-2">
    <template v-for="group in groupedTools" :key="group.id">
      <h4 class="hidden lg:flex items-center gap-1.5 text-eyebrow text-muted-foreground px-1 pb-1 mt-2 first:mt-0">
        {{ group.label }}
        <span v-if="group.id === 'structure'" class="text-label text-primary bg-primary/15 rounded px-1 py-0.5 normal-case">new</span>
      </h4>
      <AppButton
        v-for="t in group.tools"
        :key="t.id"
        variant="menu"
        size="caption"
        block
        class="gap-2 py-1.5"
        :active="activeTool === t.id"
        :disabled="t.disabled"
        :tooltip="toolTitle(t)"
        @click="$emit('update:activeTool', t.id)"
      >
        <template #icon>
          <component :is="t.icon" class="h-4 w-4 shrink-0" />
        </template>
        <span class="hidden lg:inline flex-1">{{ t.label }}</span>
        <kbd
          v-if="toolBadge(t)"
          class="hidden lg:inline text-label text-muted-foreground bg-muted/60 border border-border rounded px-1 py-0.5"
        >{{ toolBadge(t) }}</kbd>
      </AppButton>
    </template>

    <div class="hidden lg:block mt-3 border-t border-border pt-2 text-caption-sm text-muted-foreground italic space-y-1">
      <p>RMB or shift-drag pans. Shift+click with Wall wraps all 4 edges. Rect: shift-drag adds perimeter walls.</p>
      <p>Ctrl+Z undo · Ctrl+Shift+Z redo.</p>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, type Component } from "vue";
import AppButton from "@/components/common/AppButton.vue";

export type ToolGroup = "draw" | "structure" | "view";

interface ToolDef {
  id: string;
  label: string;
  icon: Component;
  /** Defaults to "draw" — every tool from before #868 belongs there, and only
   *  the Structure/View tools need to say otherwise. */
  group?: ToolGroup;
  shortcut?: string;
  displayBadge?: string;
  disabled?: boolean;
}

const GROUP_LABEL: Record<ToolGroup, string> = { draw: "Draw", structure: "Structure", view: "View" };

const { tools, activeTool } = defineProps<{
  tools: ToolDef[];
  activeTool: string;
}>();

defineEmits<{
  "update:activeTool": [tool: string];
}>();

// Groups by first-appearance order in `tools` rather than a fixed
// draw/structure/view list, so the palette never silently drops a fourth
// group a future tool introduces.
const groupedTools = computed(() => {
  const order: ToolGroup[] = [];
  const byGroup = new Map<ToolGroup, ToolDef[]>();
  for (const t of tools) {
    const group = t.group ?? "draw";
    if (!byGroup.has(group)) { byGroup.set(group, []); order.push(group); }
    byGroup.get(group)!.push(t);
  }
  return order.map((id) => ({ id, label: GROUP_LABEL[id], tools: byGroup.get(id)! }));
});

function toolBadge(t: ToolDef): string | undefined {
  return t.displayBadge ?? t.shortcut?.toUpperCase();
}

function toolTitle(t: ToolDef): string {
  const badge = toolBadge(t);
  return badge ? `${t.label} (${badge})` : t.label;
}
</script>
