<template>
  <div class="relative">
    <input
      :value="modelValue ?? ''"
      type="number"
      step="0.01"
      min="0"
      placeholder="0"
      class="w-full bg-card border border-border rounded-md px-3 py-2 pr-10 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      @input="onInput"
    />
    <span class="absolute inset-y-0 right-3 flex items-center pointer-events-none font-cinzel text-xs text-muted-foreground">lbs.</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: number | null;
}>();

const emit = defineEmits<{ "update:modelValue": [value: number | null] }>();

function onInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value;
  emit("update:modelValue", raw === "" ? null : parseFloat(raw));
}
</script>
