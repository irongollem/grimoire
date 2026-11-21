<template>
  <div class="grid gap-2 sm:grid-cols-3">
    <label class="block sm:col-span-3">
      <span class="text-caption font-semibold text-muted-foreground">Name</span>
      <AppInput v-model="name" block placeholder="Ash waste" />
    </label>
    <label class="block">
      <span class="text-caption font-semibold text-muted-foreground">Slows everyone to</span>
      <AppInput v-model.number="factor" type="number" block data-testid="terrain-factor" />
    </label>
    <label class="block">
      <span class="text-caption font-semibold text-muted-foreground">Walkers and riders sink to</span>
      <AppInput v-model.number="sink" type="number" block data-testid="terrain-sink" />
    </label>
    <p class="text-caption text-muted-foreground sm:col-span-3">
      1 is no slower. Half speed is 0.5, a third is 0.33. Sinking is at most 1; slowing may go up to 4.
    </p>
  </div>
</template>

<script setup lang="ts">
import AppInput from "@/components/common/controls/AppInput.vue";

const name = defineModel<string>("name", { required: true });
const factor = defineModel<number>("factor", { required: true });
const sink = defineModel<number>("sink", { required: true });
</script>
