<template>
  <div class="flex items-center gap-1.5">
    <input
      :value="modelValue ?? ''"
      type="number"
      step="0.01"
      min="0"
      placeholder="0"
      class="flex-1 min-w-0 bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      @input="onInput"
    />
    <span class="font-cinzel text-xs text-muted-foreground shrink-0">lbs.</span>
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
