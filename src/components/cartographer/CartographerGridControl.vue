<template>
  <!-- The grid is not a tab but a layer all the same: a switch (G) for every tab, and behind its caret how
       strong the lines are and, for a base image with a grid, how big a square is on it (Map Table frame 18). -->
  <div class="flex shrink-0 items-center">
    <AppButton
      variant="subtle"
      size="sm"
      class="rounded-r-none"
      label="Grid"
      :icon="IconGrid"
      :active="shown"
      :aria-pressed="shown"
      tooltip="Show or hide the grid (G)"
      @click="emit('update:shown', !shown)"
    />
    <CartographerPopover label="Grid options" width-class="w-64">
      <template #trigger="{ open, toggle }">
        <AppButton
          variant="subtle"
          size="icon-sm"
          class="-ml-px rounded-l-none"
          :icon="IconChevronDown"
          :active="open"
          aria-haspopup="dialog"
          :aria-expanded="open"
          aria-label="Grid options"
          tooltip="How strong the grid lines are"
          @click="toggle"
        />
      </template>
      <template #default="{ close }">
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-2">
            <span class="text-caption">Lines</span>
            <SegmentedControl
              :model-value="strength"
              :options="STRENGTH_OPTIONS"
              size="xs"
              @update:model-value="emit('update:strength', $event)"
            />
          </div>
          <p v-if="squareText" class="text-caption text-muted-foreground">{{ squareText }}</p>
          <AppButton
            v-if="canLineUp"
            variant="menu"
            size="caption"
            block
            label="Line up with the base image"
            @click="emit('lineUp'); close()"
          />
        </div>
      </template>
    </CartographerPopover>
  </div>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import CartographerPopover from "@/components/cartographer/CartographerPopover.vue";
import { IconChevronDown, IconGrid } from "@/lib/icons";
import type { GridStrength } from "@/cartographer/gridStrength";

defineProps<{
  shown: boolean;
  strength: GridStrength;
  /** A square's size on the base image ("5 ft · 64 px on the picture"); absent until a base image has a grid. */
  squareText: string | null;
  /** There is a base image to line the grid up with. */
  canLineUp: boolean;
}>();

const emit = defineEmits<{
  "update:shown": [shown: boolean];
  "update:strength": [strength: GridStrength];
  lineUp: [];
}>();

const STRENGTH_OPTIONS: SegmentedOption<GridStrength>[] = [
  { value: "faint", label: "Faint" },
  { value: "clear", label: "Clear" },
  { value: "bold", label: "Bold" },
];
</script>
