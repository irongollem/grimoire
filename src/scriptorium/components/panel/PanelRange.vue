<template>
  <PanelField :label="label">
    <div class="flex items-center gap-3">
      <input
        type="range"
        class="min-w-0 flex-1 accent-primary"
        :min="min"
        :max="max"
        :value="modelValue"
        :aria-label="label"
        @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
      />
      <span class="w-8 text-right text-caption-sm tabular-nums text-muted-foreground">{{ Math.round(modelValue) }}</span>
    </div>
  </PanelField>
</template>

<script setup lang="ts">
import PanelField from "@/scriptorium/components/panel/PanelField.vue";

defineProps<{ label: string; modelValue: number; min: number; max: number }>();
const emit = defineEmits<{ "update:modelValue": [value: number] }>();
</script>
