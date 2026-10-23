<template>
  <div
    class="grid min-h-13 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 border-b border-border py-2 sm:grid-cols-[auto_minmax(0,1fr)_9rem_8.5rem]"
    :class="row.eligible ? '' : 'text-muted-foreground'"
    :style="{ paddingLeft: `${row.depth * 1.5}rem` }"
  >
    <AppCheckbox :model-value="selected" :aria-label="row.name" @update:model-value="emit('toggle', row.key)" />
    <span class="flex min-w-0 flex-col">
      <span class="truncate">{{ row.name }}</span>
      <span v-if="row.detail" class="truncate text-caption text-muted-foreground">{{ row.detail }}</span>
    </span>
    <span class="col-start-2 flex items-center gap-1.5 text-caption font-semibold sm:col-start-auto" :class="audienceTone">
      <IconHide v-if="row.audience === 'me'" class="size-3.5" aria-hidden="true" />
      <span v-else class="size-2 rotate-45" :class="row.audience === 'party' ? 'bg-primary' : 'bg-muted-foreground'" aria-hidden="true" />
      {{ audienceLabel }}
    </span>
    <span class="col-start-2 text-caption font-semibold sm:col-start-auto" :class="bookTone">{{ bookLabel }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import { IconHide } from "@/lib/icons";
import { pluralizeCount } from "@/lib/utils";
import type { PickerRow } from "@/lib/openBook/pickerRows";

const { row, selected } = defineProps<{ row: PickerRow; selected: boolean }>();
const emit = defineEmits<{ toggle: [key: string] }>();

const audienceLabel = computed(() =>
  row.audience === "party" ? "Whole party" : row.audience === "some" ? pluralizeCount(row.visibleTo.length, "player") : "Only you",
);
const audienceTone = computed(() => (row.audience === "party" ? "text-primary" : "text-muted-foreground"));
const bookLabel = computed(() => (row.inBook ? "In the book" : row.eligible ? "Not in the book" : "Needs the party"));
const bookTone = computed(() => (row.inBook ? "text-primary" : "text-muted-foreground"));
</script>
