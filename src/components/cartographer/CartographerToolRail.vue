<template>
  <nav
    aria-label="Map tools"
    class="flex shrink-0 flex-row items-stretch gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1 lg:w-16 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden"
  >
    <!-- Families, not tools: a family button is an icon over a short word with its key in the
         corner, and picking it arms the tool you last used in it. The family's other tools are
         in the options slip over the canvas. Beside the canvas rather than over it, so no tool
         ever covers the map; below lg it lies down as a toolbar where a thumb reaches it. -->
    <template v-for="family in families" :key="family.id">
      <span
        v-if="family.dividerBefore"
        class="mx-0.5 w-px shrink-0 self-stretch bg-border lg:mx-0 lg:my-1 lg:h-px lg:w-auto lg:self-auto"
        aria-hidden="true"
      ></span>
      <AppButton
        variant="ghost"
        fill="muted"
        size="xs"
        class="relative h-12 min-w-14 shrink-0 flex-col justify-center gap-0.5 border px-1 lg:w-full lg:min-w-0"
        :class="isActive(family) ? 'border-primary/70 bg-primary/15 text-foreground' : 'border-transparent'"
        :active="isActive(family)"
        :aria-pressed="isActive(family)"
        :aria-label="family.label"
        :tooltip="familyTitle(family)"
        @click="pick(family)"
      >
        <component :is="family.icon" class="size-5" aria-hidden="true" />
        <span class="text-caption-sm leading-none">{{ family.label }}</span>
        <kbd
          v-if="familyKey(family)"
          class="absolute right-1 top-0.5 font-mono text-caption-sm leading-none text-muted-foreground"
          aria-hidden="true"
        >{{ familyKey(family) }}</kbd>
      </AppButton>
    </template>
  </nav>
</template>

<script setup lang="ts">
import { reactive, watch, type Component } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";

export interface RailTool {
  id: string;
  label: string;
  icon: Component;
  /** Single key that activates the tool (lowercase, no modifiers). */
  shortcut?: string;
  disabled?: boolean;
}

export interface RailFamily {
  id: string;
  label: string;
  icon: Component;
  /** In slip order; the first is the family's default and gives it its key. */
  tools: RailTool[];
  /** A rule above this family (Erase stands apart from the drawing families). */
  dividerBefore?: boolean;
}

const { families, activeTool } = defineProps<{
  families: RailFamily[];
  activeTool: string;
}>();

const emit = defineEmits<{
  "update:activeTool": [tool: string];
}>();

// The tool last armed in each family. A key press or a slip button changes `activeTool`
// from outside, so this follows the prop rather than the clicks it saw itself.
const lastTool = reactive<Record<string, string>>({});
watch(
  () => activeTool,
  (tool) => {
    const owner = families.find((f) => f.tools.some((t) => t.id === tool));
    if (owner) lastTool[owner.id] = tool;
  },
  { immediate: true },
);

function isActive(family: RailFamily): boolean {
  return family.tools.some((t) => t.id === activeTool);
}

function pick(family: RailFamily): void {
  // Only a remembered tool this family still holds counts: the Plan's rail reuses an id
  // ("erase") the Drawing's rail also had, with different tools inside.
  const remembered = family.tools.find((t) => t.id === lastTool[family.id] && !t.disabled);
  const target = remembered ?? family.tools.find((t) => !t.disabled);
  if (target) emit("update:activeTool", target.id);
}

function familyKey(family: RailFamily): string | undefined {
  return family.tools[0]?.shortcut?.toUpperCase();
}

function familyTitle(family: RailFamily): string {
  const key = familyKey(family);
  return key ? `${family.label} (${key})` : family.label;
}
</script>
