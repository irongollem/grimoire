<template>
  <!--
    Native <select> wrapper for filter rows. Keeps the OS-provided picker
    (which works well on mobile) but normalizes the dark-app styling that
    was duplicated across 7 list views.

    Consumers pass <option> elements through the default slot so both the
    "empty" placeholder value (often "" or "all") and the order of options
    stay the caller's choice.
  -->
  <select
    :value="modelValue"
    class="bg-card border border-border rounded-md px-2 py-1.5 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring shrink-0"
    :aria-label="ariaLabel"
    @change="
      emit('update:modelValue', ($event.target as HTMLSelectElement).value)
    "
  >
    <slot />
  </select>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string;
  ariaLabel?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();
</script>
