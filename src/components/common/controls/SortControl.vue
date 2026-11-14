<template>
  <!-- One caret, the select's own: the field is a dropdown and the direction is
       a separate toggle drawn as bars that widen the way the list runs. It used
       to wrap the select in a box behind a sort glyph (⇕) and draw the direction
       as a chevron, so three arrows sat side by side meaning three different
       things (the maintainer, 14 Nov 2026). -->
  <div class="flex items-center gap-1">
    <AppSelect v-model="sortBy" size="sm" aria-label="Sort by">
      <option v-for="opt in options" :key="opt.value" :value="opt.value">
        {{ opt.label }}
      </option>
    </AppSelect>
    <AppButton
      v-if="sortBy !== 'manual'"
      variant="subtle"
      size="icon-sm"
      :icon="sortDir === 'asc' ? IconSortAsc : IconSortDesc"
      :tooltip="sortDir === 'asc' ? 'Ascending: click to reverse' : 'Descending: click to reverse'"
      @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'"
    />
  </div>
</template>

<script setup lang="ts" generic="F extends string">
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { IconSortAsc, IconSortDesc } from "@/lib/icons";
import type { SortDir } from "@/lib/noteSort";

defineProps<{
  options: readonly { value: F; label: string }[];
}>();

const sortBy = defineModel<F>("sortBy", { required: true });
const sortDir = defineModel<SortDir>("sortDir", { required: true });
</script>
