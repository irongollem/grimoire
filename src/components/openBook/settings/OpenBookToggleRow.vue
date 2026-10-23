<template>
  <div class="grid max-w-xl grid-cols-[minmax(0,1fr)_auto] items-center gap-6 border-b border-border py-2.5">
    <span class="flex flex-col gap-0.5">
      <span class="text-body text-foreground">{{ label }}</span>
      <span class="text-caption text-muted-foreground">{{ hint }}</span>
    </span>
    <ToggleSwitch v-model="model" :aria-label="label" />
  </div>
</template>

<script setup lang="ts">
import ToggleSwitch from "@/components/common/controls/ToggleSwitch.vue";

const model = defineModel<boolean>({ required: true });
defineProps<{ label: string; hint: string }>();
</script>
