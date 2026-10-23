<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 border-b border-foreground/40 py-2 sm:grid-cols-[auto_minmax(0,1fr)_9rem_8.5rem]">
      <AppCheckbox
        :model-value="allSelected"
        :disabled="rows.length === 0"
        :aria-label="`Select all ${rows.length} shown`"
        @update:model-value="emit('toggle-all', !allSelected)"
      />
      <span class="text-eyebrow text-muted-foreground">{{ heading }}</span>
      <span class="hidden text-eyebrow text-muted-foreground sm:block">Your table</span>
      <span class="hidden text-eyebrow text-muted-foreground sm:block">In the book</span>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto" :style="{ maxHeight: 'min(60dvh, 32rem)' }">
      <VirtualGrid
        v-if="rows.length > 0"
        :items="rows"
        :item-key="(row: PickerRow) => row.key"
        :columns="1"
        :estimate-row-height="56"
        :gap="0"
      >
        <template #default="{ item }">
          <PickerRowItem :row="item" :selected="selected.has(item.key)" @toggle="emit('toggle', $event)" />
        </template>
      </VirtualGrid>
      <p v-else class="py-8 text-center text-muted-foreground">Nothing matches.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import VirtualGrid from "@/components/common/list/VirtualGrid.vue";
import PickerRowItem from "./PickerRow.vue";
import type { PickerRow } from "@/lib/openBook/pickerRows";

const { rows, selected, heading } = defineProps<{
  /** The rows passing the filters. */
  rows: PickerRow[];
  selected: ReadonlySet<string>;
  heading: string;
}>();
const emit = defineEmits<{ toggle: [key: string]; "toggle-all": [checked: boolean] }>();

const allSelected = computed(() => rows.length > 0 && rows.every((row) => selected.has(row.key)));
</script>
