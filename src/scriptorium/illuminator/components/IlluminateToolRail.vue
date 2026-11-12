<template>
  <nav aria-label="Tools" class="flex w-24 shrink-0 flex-col items-stretch gap-1 overflow-y-auto border-r border-border bg-card p-2">
    <span class="text-center text-eyebrow uppercase text-muted-foreground" data-testid="rail-paint-label">Paint</span>
    <AppButton
      v-for="t in PAINT_RAIL"
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
    <div class="flex justify-center py-1">
      <ColourSwatch :colour="colour" :label="`Colour ${rgbToHex(colour)}. Open the colour panel`" title="Colour" @pick="emit('open-colour')" />
    </div>

    <span class="mt-2 text-center text-eyebrow uppercase text-muted-foreground" data-testid="rail-picture-label">Picture</span>
    <AppButton
      v-for="t in PICTURE_RAIL"
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
import type { PaintTool } from "@/scriptorium/illuminator/paint/session/types";
import type { Rgb } from "@/scriptorium/illuminator/paint/engine/types";
import ColourSwatch from "@/scriptorium/illuminator/paint/components/ColourSwatch.vue";
import { rgbToHex } from "@/scriptorium/illuminator/paint/components/colourMath";
import type { PictureTool, WorkbenchTool } from "@/scriptorium/illuminator/useIlluminateWorkbench";
import { IconBrush, IconCenter, IconCrop, IconEraser, IconFill, IconGrid, IconPicker, IconScan, IconScissors, IconSmudge, IconWater, type AppIcon } from "@/lib/icons";

defineProps<{ tool: WorkbenchTool; /** The colour the paint tools use now. */ colour: Rgb }>();
const emit = defineEmits<{ "update:tool": [value: WorkbenchTool]; "open-colour": [] }>();

const PAINT_RAIL: { value: PaintTool; label: string; icon: AppIcon }[] = [
  { value: "brush", label: "Brush", icon: IconBrush },
  { value: "smudge", label: "Smudge", icon: IconSmudge },
  { value: "eraser", label: "Eraser", icon: IconEraser },
  { value: "picker", label: "Pick colour", icon: IconPicker },
];
const PICTURE_RAIL: { value: PictureTool; label: string; icon: AppIcon }[] = [
  { value: "crop", label: "Crop", icon: IconCrop },
  { value: "edges", label: "Edges", icon: IconScissors },
  { value: "grade", label: "Grade", icon: IconWater },
  { value: "vignette", label: "Vignette", icon: IconScan },
  { value: "texture", label: "Texture", icon: IconGrid },
  { value: "wash", label: "Wash", icon: IconFill },
  { value: "focus", label: "Focus", icon: IconCenter },
];
const LATER = ["Text"];
</script>
