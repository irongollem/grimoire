<template>
  <div class="flex flex-col gap-1">
    <div class="flex items-center justify-between gap-3">
      <span :id="labelId" class="text-body text-foreground">{{ label }}</span>
      <ToggleSwitch :model-value="modelValue" :disabled="disabled" :aria-label="label" @update:model-value="emit('update:modelValue', $event)" />
    </div>
    <p v-if="hint" class="text-caption text-muted-foreground">{{ hint }}</p>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { useId } from "vue";
import ToggleSwitch from "@/components/common/controls/ToggleSwitch.vue";

/** One switch of the inspector with its label, an optional hint under it, and room for the options it opens. */
defineProps<{ modelValue: boolean; label: string; hint?: string; disabled?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();
const labelId = useId();
</script>
