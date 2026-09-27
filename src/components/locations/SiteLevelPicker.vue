<template>
  <div class="flex items-center gap-1.5 rounded-md border border-border bg-card/95 py-0.5 pl-2 pr-0.5">
    <IconLayers class="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    <AppSelect
      :model-value="activeId"
      tone="underline"
      size="body-xs"
      aria-label="Level"
      class="max-w-56 truncate"
      @update:model-value="onChange"
    >
      <option v-for="(level, i) in levels" :key="level.id" :value="level.id">{{ i + 1 }} · {{ level.name }}</option>
    </AppSelect>
  </div>
</template>

<script setup lang="ts">
/**
 * Which level of a site the Build canvas is showing, floating on the canvas.
 *
 * Browse lists a site's levels in the rail beside its map (`SiteLevelsRail`),
 * but Build folds that column away to give the workbench the pane's width, so
 * a DM drawing one floor had no way to see the others or move to them. This
 * is the same list (`levelsOf`, numbered the same way) in the one place Build
 * always shows. A native select: a site has a handful of levels and nothing
 * to search, and on a phone it opens the OS picker.
 */
import AppSelect from "@/components/common/AppSelect.vue";
import { IconLayers } from "@/lib/icons";
import type { Location } from "@/types/location.types";

const { levels, activeId } = defineProps<{
  /** `levelsOf(...).levels`: the container first, then its levels in order. */
  levels: readonly Pick<Location, "id" | "name">[];
  activeId: string;
}>();

const emit = defineEmits<{ select: [id: string] }>();

function onChange(id: string): void {
  // Only ever one of the listed levels: a select with nothing selected reads
  // back as "", which would otherwise navigate to no place at all.
  if (id !== activeId && levels.some((level) => level.id === id)) emit("select", id);
}
</script>
