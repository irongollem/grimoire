<template>
  <aside class="flex lg:flex-col flex-row gap-1 lg:w-44 shrink-0 bg-card border border-border rounded-lg p-2">
    <h4 class="hidden lg:block font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase px-1 pb-1">
      Tools
    </h4>
    <button
      v-for="t in tools"
      :key="t.id"
      type="button"
      class="flex items-center gap-2 rounded-md px-2 py-1.5 font-fell text-xs transition-colors text-left"
      :class="
        activeTool === t.id
          ? 'bg-primary/15 text-foreground'
          : t.disabled
            ? 'text-muted-foreground/50 cursor-not-allowed'
            : 'hover:bg-muted text-foreground'
      "
      :disabled="t.disabled"
      :title="toolTitle(t)"
      @click="$emit('update:activeTool', t.id)"
    >
      <component :is="t.icon" class="h-4 w-4 shrink-0" />
      <span class="hidden lg:inline flex-1">{{ t.label }}</span>
      <kbd
        v-if="toolBadge(t)"
        class="hidden lg:inline font-cinzel text-[9px] tracking-wider text-muted-foreground bg-muted/60 border border-border rounded px-1 py-0.5"
      >{{ toolBadge(t) }}</kbd>
    </button>

    <div class="hidden lg:block mt-3 border-t border-border pt-2 text-[10px] font-fell text-muted-foreground italic space-y-1">
      <p>RMB or shift-drag pans. Shift+click with Wall wraps all 4 edges. Rect: shift-drag adds perimeter walls.</p>
      <p>Ctrl+Z undo · Ctrl+Shift+Z redo.</p>
    </div>
  </aside>
</template>

<script setup lang="ts">
interface ToolDef {
  id: string;
  label: string;
  icon: unknown;
  shortcut?: string;
  displayBadge?: string;
  disabled?: boolean;
}

const { tools, activeTool } = defineProps<{
  tools: ToolDef[];
  activeTool: string;
}>();

defineEmits<{
  "update:activeTool": [tool: string];
}>();

function toolBadge(t: ToolDef): string | undefined {
  return t.displayBadge ?? t.shortcut?.toUpperCase();
}

function toolTitle(t: ToolDef): string {
  const badge = toolBadge(t);
  return badge ? `${t.label} (${badge})` : t.label;
}
</script>
