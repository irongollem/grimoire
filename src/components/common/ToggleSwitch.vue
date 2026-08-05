<template>
  <button
    type="button"
    class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200"
    :class="modelValue ? 'bg-primary' : 'bg-muted'"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="ariaLabel"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span
      class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200"
      :class="modelValue ? 'translate-x-5' : 'translate-x-0'"
    />
  </button>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: boolean;
  ariaLabel?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();
</script>
