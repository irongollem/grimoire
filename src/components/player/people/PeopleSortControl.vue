<template>
  <div class="flex items-center gap-1.5">
    <SegmentedControl v-model="sortBy" :options="options" wrap />
    <AppButton
      variant="subtle"
      size="icon-sm"
      :icon="dir === 'asc' ? IconChevronUp : IconChevronDown"
      :aria-label="dir === 'asc' ? 'Ascending' : 'Descending'"
      @click="dir = dir === 'asc' ? 'desc' : 'asc'"
    />
  </div>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import { IconChevronDown, IconChevronUp } from "@/lib/icons";
import type { SortDir } from "@/lib/noteSort";
import type { PlayerNpcSortField } from "@/lib/npcs/playerNpcSort";

/** Sort field and direction for the People page. */
defineProps<{ options: ReadonlyArray<{ value: PlayerNpcSortField; label: string }> }>();

const sortBy = defineModel<PlayerNpcSortField>("sortBy", { required: true });
const dir = defineModel<SortDir>("dir", { required: true });
</script>
