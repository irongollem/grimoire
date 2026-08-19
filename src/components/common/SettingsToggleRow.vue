<template>
  <div class="flex items-center justify-between">
    <div>
      <p class="font-cinzel text-xs text-foreground tracking-wide">{{ label }}</p>
      <p class="text-caption text-muted-foreground italic">{{ description }}</p>
    </div>
    <ToggleSwitch
      size="lg"
      :model-value="modelValue"
      :aria-label="label"
      class="ml-3"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import ToggleSwitch from "@/components/common/ToggleSwitch.vue";

defineProps<{
  modelValue: boolean;
  label: string;
  description: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();
</script>
