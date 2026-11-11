<template>
  <nav aria-label="Tools" class="flex w-24 shrink-0 flex-col items-stretch gap-1 border-r border-border bg-card p-2">
    <AppButton
      v-for="t in TOOLS"
      :key="t.value"
      variant="ghost"
      size="sm"
      :icon="t.icon"
      :label="t.label"
      :active="tool === t.value"
      class="h-auto flex-col gap-1 py-2 text-caption"
      :data-testid="`tool-${t.value}`"
      @click="emit('update:tool', t.value)"
    />
    <span class="mt-3 text-center text-eyebrow uppercase text-muted-foreground">Later</span>
    <AppButton
      v-for="label in LATER"
      :key="label"
      variant="ghost"
      size="sm"
      :label="label"
      disabled
      class="border border-dashed border-border text-caption"
    />
  </nav>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import type { WorkbenchTool } from "@/scriptorium/illuminator/useIlluminateWorkbench";
import { IconBrush, IconCenter, IconGrid, IconScan, IconScissors, IconWater, type AppIcon } from "@/lib/icons";

defineProps<{ tool: WorkbenchTool }>();
const emit = defineEmits<{ "update:tool": [value: WorkbenchTool] }>();

const TOOLS: { value: WorkbenchTool; label: string; icon: AppIcon }[] = [
  { value: "edges", label: "Edges", icon: IconScissors },
  { value: "colour", label: "Colour", icon: IconWater },
  { value: "vignette", label: "Vignette", icon: IconScan },
  { value: "texture", label: "Texture", icon: IconGrid },
  { value: "focus", label: "Focus", icon: IconCenter },
  { value: "brush", label: "Brush", icon: IconBrush },
];
// Crop is on the sheet, but a recipe has no crop step yet: it would change the picture's size, which the bake and print do not expect.
const LATER = ["Crop", "Draw", "Text", "Layers"];
</script>
