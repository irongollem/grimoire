<template>
  <div class="flex flex-wrap items-center gap-2">
    <ListSearchInput v-model="search" placeholder="Search entries" :inline="false" class="w-full sm:w-64" />
    <div class="w-full sm:w-56">
      <EntityCombobox v-model="placeId" :options="placeOptions" placeholder="Under a place…" />
    </div>
    <AppSelect v-model="audience" size="body" aria-label="Shared with">
      <option value="any">Shared with: anyone</option>
      <option value="party">Whole party</option>
      <option value="some">Some players</option>
      <option value="me">Only me</option>
    </AppSelect>
    <AppButton variant="chip" size="sm" label="Not in the book" :active="notInBook" @click="notInBook = !notInBook" />
    <AppButton v-if="active" variant="ghost" size="sm" label="Clear" @click="emit('clear')" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import ListSearchInput from "@/components/common/list/ListSearchInput.vue";
import type { AudienceFilter } from "@/lib/openBook/pickerRows";

const search = defineModel<string>("search", { required: true });
/** The place the list is narrowed to; empty for anywhere. */
const placeId = defineModel<string>("placeId", { required: true });
const audience = defineModel<AudienceFilter>("audience", { required: true });
const notInBook = defineModel<boolean>("notInBook", { required: true });
const { placeOptions, hasActiveFilters } = defineProps<{
  placeOptions: { id: string; name: string }[];
  hasActiveFilters: boolean;
}>();
const emit = defineEmits<{ clear: [] }>();

const active = computed(() => hasActiveFilters);
</script>
