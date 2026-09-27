<template>
  <div class="flex items-center gap-1 rounded-md border border-border bg-card/95 py-0.5 pl-2 pr-0.5">
    <IconLayers class="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    <template v-if="levels.length > 1">
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
      <AppButton
        variant="ghost"
        fill="muted"
        size="icon-xs"
        :icon="IconAdd"
        :tooltip="`Add level ${levels.length + 1}`"
        :aria-label="`Add level ${levels.length + 1}`"
        :loading="adding"
        :disabled="adding"
        @click="$emit('add')"
      />
    </template>
    <!-- One floor so far: nothing to switch between, so the control is the
         way to add the second. -->
    <AppButton
      v-else
      variant="ghost"
      size="xs"
      label="Add a level"
      tooltip="Add another floor to this place, with its own map and rooms"
      :loading="adding"
      :disabled="adding"
      @click="$emit('add')"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * Which level of a site the Build canvas is showing, floating on the canvas,
 * and the way to add the next one.
 *
 * Browse lists a site's levels in the rail beside its map (`SiteLevelsRail`),
 * but Build folds that column away to give the workbench the pane's width, so
 * a DM drawing one floor had no way to see the others or move to them. This
 * is the same list (`levelsOf`, numbered the same way) in the one place Build
 * always shows. It is also the only place a FIRST level can be added: the
 * Browse rail appears only once a site has one. A native select for the
 * list: a site has a handful of levels and nothing to search, and on a phone
 * it opens the OS picker.
 */
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { IconAdd, IconLayers } from "@/lib/icons";
import type { Location } from "@/types/location.types";

const { levels, activeId, adding = false } = defineProps<{
  /** `levelsOf(...).levels`: the site first, then its levels in order. Just
   *  the site itself when it has none yet. */
  levels: readonly Pick<Location, "id" | "name">[];
  activeId: string;
  adding?: boolean;
}>();

const emit = defineEmits<{ select: [id: string]; add: [] }>();

function onChange(id: string): void {
  // Only ever one of the listed levels: a select with nothing selected reads
  // back as "", which would otherwise navigate to no place at all.
  if (id !== activeId && levels.some((level) => level.id === id)) emit("select", id);
}
</script>
