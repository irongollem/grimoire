<template>
  <div class="flex items-center gap-0.5" :style="{ paddingLeft: indent }">
    <!--
      Expander and row are separate targets on purpose: opening a region to see
      what is in it and selecting the region itself are different intents, and
      merging them makes one of the two impossible.
    -->
    <template v-if="showExpander">
      <AppButton
        v-if="row.hasChildren"
        variant="ghost"
        size="icon-xs"
        :icon="expanded ? IconChevronDown : IconChevronRight"
        :aria-label="`${expanded ? 'Collapse' : 'Expand'} ${row.loc.name}`"
        :aria-expanded="expanded"
        @click="$emit('toggle', row.loc.id)"
      />
      <span v-else class="w-5 shrink-0" aria-hidden="true" />
    </template>

    <AppButton
      variant="ghost"
      size="sm"
      block
      :active="selected"
      class="min-w-0 justify-start gap-2 rounded-md px-2 hover:bg-muted"
      @click="$emit('select', row.loc.id)"
    >
      <span
        class="h-2 w-2 shrink-0 rounded-full"
        :style="{ backgroundColor: LOCATION_TYPE_COLORS[row.loc.location_type] }"
      />
      <span
        class="min-w-0 flex-1 truncate text-left font-cinzel text-label-lg"
        :class="[
          selected ? 'text-foreground font-bold' : 'text-foreground/90',
          outOfEra && 'opacity-50',
        ]"
      >
        {{ row.loc.name || "Unnamed Location" }}
      </span>

      <span
        v-if="row.descendantCount"
        class="shrink-0 tabular-nums text-caption-sm text-muted-foreground"
        :title="`${row.descendantCount} places inside`"
        >{{ row.descendantCount }}</span
      >
      <IconMap
        v-if="row.loc.map_url && !row.loc.is_battle_map"
        class="h-3 w-3 shrink-0 text-muted-foreground/70"
        :aria-label="`${row.loc.name} has a map`"
      />
    </AppButton>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { IconChevronDown, IconChevronRight, IconMap } from "@/lib/icons";
import type { AtlasRow } from "@/lib/locations/tree";
import { LOCATION_TYPE_COLORS } from "@/types/location.types";

const {
  row,
  expanded,
  selected,
  outOfEra,
  showExpander = true,
} = defineProps<{
  row: AtlasRow;
  expanded: boolean;
  selected: boolean;
  outOfEra: boolean;
  /**
   * Off in the place pane, which lists a location's children without tracking
   * their expansion — a chevron there would open nothing.
   */
  showExpander?: boolean;
}>();

defineEmits<{ toggle: [id: string]; select: [id: string] }>();

/** 1rem per level — deep enough to read as nesting, shallow enough for depth 6. */
const indent = computed(() => `${row.depth}rem`);
</script>
