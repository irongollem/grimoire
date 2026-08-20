<template>
  <div class="relative">
    <AppInput
      v-model.number="model"
      type="number"
      step="0.01"
      min="0"
      tone="card"
      size="body"
      placeholder="0"
      class="pr-10"
    />
    <span class="absolute inset-y-0 right-3 flex items-center pointer-events-none font-cinzel text-xs text-muted-foreground">lbs.</span>
  </div>
</template>

<script setup lang="ts">
import AppInput from "@/components/common/AppInput.vue";

const model = defineModel<number | null>({ required: true });
</script>
