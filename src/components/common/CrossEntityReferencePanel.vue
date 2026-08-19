<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between gap-2">
      <p class="text-label-lg font-semibold text-muted-foreground">{{ label }}</p>
      <span v-if="selected.length" class="text-caption text-muted-foreground/70 italic">{{ selected.length }}</span>
    </div>

    <EntityCombobox
      :model-value="''"
      :options="addableOptions"
      :placeholder="placeholder ?? 'Search…'"
      @update:model-value="onAdd"
    />

    <div v-if="selected.length === 0" class="text-caption text-muted-foreground/60 italic">
      {{ emptyText ?? 'None linked.' }}
    </div>

    <ul v-else class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
      <li
        v-for="entity in selected"
        :key="entity.id"
        class="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-1.5"
      >
        <component
          :is="entity.routeTo ? 'RouterLink' : 'span'"
          :to="entity.routeTo"
          class="text-body text-foreground truncate"
          :class="entity.routeTo ? 'hover:text-primary transition-colors' : ''"
        >{{ entity.name }}</component>
        <AppButton
          variant="ghost"
          tone="danger"
          size="inline-xs"
          label="×"
          class="shrink-0"
          :tooltip="`Remove ${entity.name}`"
          @click="onRemove(entity.id)"
        />
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import AppButton from "@/components/common/AppButton.vue";

export interface ReferenceOption {
  id: string;
  name: string;
  routeTo?: string;
}

const props = defineProps<{
  modelValue: string[];
  options: ReadonlyArray<ReferenceOption>;
  label: string;
  placeholder?: string;
  emptyText?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string[]): void;
}>();

const selected = computed(() =>
  props.modelValue
    .map((id) => props.options.find((o) => o.id === id))
    .filter((o): o is ReferenceOption => Boolean(o)),
);

const addableOptions = computed(() =>
  props.options.filter((o) => !props.modelValue.includes(o.id)),
);

function onAdd(id: string) {
  if (!id || props.modelValue.includes(id)) return;
  emit("update:modelValue", [...props.modelValue, id]);
}

function onRemove(id: string) {
  emit("update:modelValue", props.modelValue.filter((existing) => existing !== id));
}
</script>
