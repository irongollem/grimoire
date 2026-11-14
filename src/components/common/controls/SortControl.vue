<template>
  <!-- The one sort control: a field and its direction. The field is a dropdown
       (one caret, the select's own) or, for a few fixed fields, segmented
       buttons; the direction is a separate toggle drawn as bars that widen the
       way the list runs. It used to sit behind a sort glyph (⇕) with a chevron
       for direction, three arrows side by side meaning three different things,
       and the People page drew its own copy with a lone chevron that read as a
       menu (the maintainer, 14 Nov 2026: "I never want to see that confusing
       jumble again"). A sort with a direction goes through here. -->
  <div class="flex items-center gap-1.5">
    <SegmentedControl v-if="display === 'segmented'" v-model="sortBy" :options="options" wrap />
    <AppSelect v-else v-model="sortBy" size="sm" aria-label="Sort by">
      <option v-for="opt in options" :key="opt.value" :value="opt.value">
        {{ opt.label }}
      </option>
    </AppSelect>
    <!-- A hand-made order has no direction to reverse. -->
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
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import { IconSortAsc, IconSortDesc } from "@/lib/icons";
import type { SortDir } from "@/lib/noteSort";

const { display = "select" } = defineProps<{
  options: readonly { value: F; label: string }[];
  /** A dropdown by default; `segmented` lays a few fixed fields out as buttons (the People page). */
  display?: "select" | "segmented";
}>();

const sortBy = defineModel<F>("sortBy", { required: true });
const sortDir = defineModel<SortDir>("sortDir", { required: true });
</script>
