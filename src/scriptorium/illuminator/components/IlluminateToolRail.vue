<template>
  <nav aria-label="Tools" class="flex w-30 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-border bg-card p-2">
    <div v-for="group in GROUPS" :key="group.id" class="flex flex-col items-stretch gap-1" :data-testid="`rail-${group.id}-group`">
      <span class="text-center text-eyebrow uppercase text-muted-foreground" :data-testid="`rail-${group.id}-label`">{{ group.label }}</span>
      <div class="grid grid-cols-2 gap-1">
        <AppButton
          v-for="t in group.tools"
          :key="t.value"
          variant="tool"
          size="tile-icon"
          :icon="t.icon"
          :aria-label="t.label"
          :tooltip="`${t.label} (${TOOL_KEYS[t.value].toUpperCase()})`"
          :active="tool === t.value"
          :data-testid="`tool-${t.value}`"
          @click="emit('update:tool', t.value)"
        >
          <KeyCap corner :data-testid="`key-${t.value}`">{{ TOOL_KEYS[t.value].toUpperCase() }}</KeyCap>
        </AppButton>
      </div>

      <!-- Colours sit with the Paint tools they belong to: foreground over background, like a painter's palette. -->
      <div v-if="group.id === 'paint'" class="relative mx-auto my-1 h-14 w-14" data-testid="rail-colours">
        <ColourSwatch
          large
          class="absolute bottom-0 right-0"
          :colour="background"
          :selected="editing === 'background'"
          :label="`Background colour ${rgbToHex(background)}. Edit it`"
          :title="`Background colour (${SWAP_KEY.toUpperCase()} swaps)`"
          data-testid="swatch-background"
          @pick="emit('open-colour', 'background')"
        />
        <ColourSwatch
          large
          class="absolute left-0 top-0"
          :colour="colour"
          :selected="editing === 'foreground'"
          :label="`Foreground colour ${rgbToHex(colour)}. Edit it`"
          :title="`Foreground colour, the one you paint with (${SWAP_KEY.toUpperCase()} swaps)`"
          data-testid="swatch-foreground"
          @pick="emit('open-colour', 'foreground')"
        />
        <AppButton class="absolute right-0 top-0" variant="ghost" size="icon-2xs" :icon="IconRepeat" aria-label="Swap the colours" :tooltip="`Swap the colours (${SWAP_KEY.toUpperCase()})`" data-testid="swap-colours" @click="emit('swap-colours')" />
        <AppButton class="absolute bottom-0 left-0" variant="ghost" size="icon-2xs" :icon="IconReset" aria-label="Reset the colours" :tooltip="`Ink on paper again (${RESET_KEY.toUpperCase()})`" data-testid="reset-colours" @click="emit('reset-colours')" />
      </div>
    </div>

    <span class="mt-1 text-center text-eyebrow uppercase text-muted-foreground">Later</span>
    <AppButton
      v-for="label in LATER"
      :key="label"
      variant="ghost"
      size="xs"
      :icon="IconAnnotate"
      :aria-label="`${label}, coming later`"
      :tooltip="`${label}, coming later`"
      disabled
      class="border border-dashed border-border"
    />
  </nav>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import KeyCap from "@/components/common/controls/KeyCap.vue";
import type { PaintTool } from "@/scriptorium/illuminator/paint/session/types";
import type { Rgb } from "@/scriptorium/illuminator/paint/engine/types";
import ColourSwatch from "@/scriptorium/illuminator/paint/components/ColourSwatch.vue";
import { rgbToHex } from "@/scriptorium/illuminator/paint/components/colourMath";
import type { PictureTool, WorkbenchTool } from "@/scriptorium/illuminator/useIlluminateWorkbench";
import { RESET_KEY, SWAP_KEY, TOOL_KEYS } from "@/scriptorium/illuminator/toolKeys";
import { IconBrush, IconCenter, IconCrop, IconEraser, IconFill, IconGrid, IconPicker, IconRepeat, IconReset, IconScan, IconScissors, IconSmudge, IconAnnotate, IconWater, type AppIcon } from "@/lib/icons";

/**
 * The tool rail: two columns of icons, each named in its tooltip and showing its key in the corner (the keys are
 * the workbench's own table, `toolKeys.ts`), then the foreground and background colours.
 */
defineProps<{
  tool: WorkbenchTool;
  /** The foreground: what the paint tools lay down. */
  colour: Rgb;
  background: Rgb;
  /** Which swatch the Colour panel is editing. */
  editing: "foreground" | "background";
}>();
const emit = defineEmits<{ "update:tool": [value: WorkbenchTool]; "open-colour": [target: "foreground" | "background"]; "swap-colours": []; "reset-colours": [] }>();

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
const GROUPS = [
  { id: "paint", label: "Paint", tools: PAINT_RAIL },
  { id: "picture", label: "Picture", tools: PICTURE_RAIL },
] as const;
const LATER = ["Text"];
</script>
