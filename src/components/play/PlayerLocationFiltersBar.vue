<template>
  <div class="flex items-center gap-2">
    <div class="relative flex-1">
      <IconSearch class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      <AppInput
        v-model="searchModel"
        tone="muted"
        size="body"
        class="pl-8"
        placeholder="Search locations…"
      />
    </div>
    <AppSelect v-model="typeFilterModel" tone="muted" size="sm" ariaLabel="Location type filter">
      <option value="all">All types</option>
      <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
    </AppSelect>
    <AppButton
      v-if="hasActiveFilters"
      variant="ghost"
      size="inline"
      class="shrink-0"
      label="Clear"
      @click="$emit('clear')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconSearch } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";

interface TypeOption {
  value: string;
  label: string;
}

const { search, typeFilter, typeOptions } = defineProps<{
  search: string;
  typeFilter: string;
  typeOptions: TypeOption[];
  hasActiveFilters: boolean;
}>();

const emit = defineEmits<{
  'update:search': [value: string];
  'update:typeFilter': [value: string];
  clear: [];
}>();

const typeFilterModel = computed({
  get: () => typeFilter,
  set: (v: string) => emit('update:typeFilter', v),
});

const searchModel = computed({
  get: () => search,
  set: (v: string) => emit('update:search', v),
});
</script>
